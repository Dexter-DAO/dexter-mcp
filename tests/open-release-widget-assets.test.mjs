import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  publishOpenWidgetAssets,
  readOpenWidgetAssetPlan,
  verifyPublicOpenWidgetAssets,
} from '../lib/open-release-widget-assets.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'opendexter-widget-assets-'));
  const releaseDir = join(root, 'release');
  const appsRoot = join(releaseDir, 'public/apps-sdk');
  const releaseAssets = join(appsRoot, 'assets');
  const targetRoot = join(root, 'public');
  const targetAssets = join(targetRoot, 'assets');
  await mkdir(releaseAssets, { recursive: true });
  await mkdir(targetAssets, { recursive: true });
  await writeFile(join(releaseAssets, 'entry-AAAA.js'), [
    'import "./dynamic-CCCC.js";',
    'export const dark = new URL("dexter-wallet-lockup-dark-EEEE.svg", import.meta.url).href;',
    'export const light = new URL("dexter-wallet-lockup-light-FFFF.svg", import.meta.url).href;',
  ].join('\n'));
  await writeFile(join(releaseAssets, 'entry-BBBB.css'), '.ok { color: green; }\n');
  await writeFile(
    join(releaseAssets, 'dynamic-CCCC.js'),
    'export const later = () => import("./lazy-DDDD.js");\n',
  );
  await writeFile(join(releaseAssets, 'lazy-DDDD.js'), 'export const lazy = true;\n');
  await writeFile(
    join(releaseAssets, 'dexter-wallet-lockup-dark-EEEE.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ink"/></defs><path fill="url(#ink)"/></svg>\n',
  );
  await writeFile(
    join(releaseAssets, 'dexter-wallet-lockup-light-FFFF.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#f46722"/></svg>\n',
  );
  await writeFile(
    join(releaseAssets, 'widget-icon-GGGG.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="4" r="4"/></svg>\n',
  );
  await writeFile(join(releaseAssets, 'entry-AAAA.js.map'), '{}\n');
  await writeFile(join(appsRoot, 'widget.html'), [
    '<!doctype html>',
    '<link rel="icon" href="./assets/widget-icon-GGGG.svg">',
    '<link rel="stylesheet" href="./assets/entry-BBBB.css">',
    '<link rel="modulepreload" href="./assets/dynamic-CCCC.js">',
    '<script type="module" src="./assets/entry-AAAA.js"></script>',
  ].join('\n'));
  await writeFile(join(targetAssets, 'historical-OLD.js'), 'old bytes stay\n');
  await chmod(targetAssets, 0o700);
  await chmod(targetRoot, 0o700);
  await chmod(releaseAssets, 0o500);
  await chmod(appsRoot, 0o500);
  await chmod(releaseDir, 0o500);
  return {
    root,
    release: { releaseDir },
    releaseAssets,
    targetRoot,
    targetAssets,
  };
}

test('sealed release plan binds every admitted Vite runtime asset byte', async () => {
  const current = await fixture();
  try {
    const plan = await readOpenWidgetAssetPlan(current.release);
    assert.deepEqual(plan.assets.map(({ name }) => name), [
      'dexter-wallet-lockup-dark-EEEE.svg',
      'dexter-wallet-lockup-light-FFFF.svg',
      'dynamic-CCCC.js',
      'entry-AAAA.js',
      'entry-BBBB.css',
      'lazy-DDDD.js',
      'widget-icon-GGGG.svg',
    ]);
    assert.equal(plan.assets.some(({ name }) => name.endsWith('.map')), false);
    assert.deepEqual(
      plan.assets
        .filter(({ name }) => name.startsWith('dexter-wallet-lockup-'))
        .map(({ name, mime, sha256 }) => [name, mime, sha256.length]),
      [
        ['dexter-wallet-lockup-dark-EEEE.svg', 'image/svg+xml', 64],
        ['dexter-wallet-lockup-light-FFFF.svg', 'image/svg+xml', 64],
      ],
    );
    assert.deepEqual(plan.referencedAssets.map(({ name, mime }) => [name, mime]), [
      ['dynamic-CCCC.js', 'application/javascript'],
      ['entry-AAAA.js', 'application/javascript'],
      ['entry-BBBB.css', 'text/css'],
      ['widget-icon-GGGG.svg', 'image/svg+xml'],
    ]);
  } finally {
    await chmod(current.release.releaseDir, 0o700);
    await chmod(join(current.release.releaseDir, 'public/apps-sdk'), 0o700);
    await chmod(current.releaseAssets, 0o700);
    await rm(current.root, { recursive: true, force: true });
  }
});

test('publish is append-only, atomic by name, and refuses a hash collision', async () => {
  const current = await fixture();
  try {
    const plan = await readOpenWidgetAssetPlan(current.release);
    assert.deepEqual(
      await publishOpenWidgetAssets({ plan, targetRoot: current.targetRoot }),
      { added: 7, retained: 0 },
    );
    assert.equal(
      await readFile(join(current.targetAssets, 'historical-OLD.js'), 'utf8'),
      'old bytes stay\n',
    );
    assert.deepEqual(
      await publishOpenWidgetAssets({ plan, targetRoot: current.targetRoot }),
      { added: 0, retained: 7 },
    );
    await chmod(join(current.targetAssets, 'entry-AAAA.js'), 0o644);
    await writeFile(join(current.targetAssets, 'entry-AAAA.js'), 'hostile bytes\n');
    await assert.rejects(
      publishOpenWidgetAssets({ plan, targetRoot: current.targetRoot }),
      /conflicts with entry-AAAA\.js/,
    );
  } finally {
    await chmod(current.release.releaseDir, 0o700);
    await chmod(join(current.release.releaseDir, 'public/apps-sdk'), 0o700);
    await chmod(current.releaseAssets, 0o700);
    await rm(current.root, { recursive: true, force: true });
  }
});

function exactFetch(plan, mutate = () => {}) {
  const byName = new Map(plan.assets.map((asset) => [asset.name, asset]));
  return async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    const asset = byName.get(name);
    const response = {
      status: 200,
      redirected: false,
      headers: { get: (key) => key === 'content-type' ? asset.mime : null },
      arrayBuffer: async () => readFile(asset.source),
    };
    mutate(response, asset);
    return response;
  };
}

test('public gate requires 200, exact MIME, and exact sealed bytes', async () => {
  const current = await fixture();
  try {
    const plan = await readOpenWidgetAssetPlan(current.release);
    await assert.doesNotReject(verifyPublicOpenWidgetAssets({
      plan,
      fetchImpl: exactFetch(plan),
      baseUrl: 'https://example.test/mcp/app-assets/assets',
      timeoutMs: 100,
    }));
    for (const [mutation, expected] of [
      [(response) => { response.status = 404; }, /returned HTTP 404/],
      [(response) => {
        response.headers.get = () => 'text/plain';
      }, /wrong MIME type/],
      [(response) => {
        response.arrayBuffer = async () => Buffer.from('hostile bytes');
      }, /differs from the sealed release/],
      [(response) => { response.redirected = true; }, /returned HTTP 200/],
    ]) {
      await assert.rejects(
        verifyPublicOpenWidgetAssets({
          plan,
          fetchImpl: exactFetch(plan, mutation),
          baseUrl: 'https://example.test/mcp/app-assets/assets',
          timeoutMs: 100,
        }),
        expected,
      );
    }
  } finally {
    await chmod(current.release.releaseDir, 0o700);
    await chmod(join(current.release.releaseDir, 'public/apps-sdk'), 0o700);
    await chmod(current.releaseAssets, 0o700);
    await rm(current.root, { recursive: true, force: true });
  }
});

test('public gate fetches both wallet SVGs and enforces their sealed MIME and hash', async () => {
  const current = await fixture();
  try {
    const plan = await readOpenWidgetAssetPlan(current.release);
    const fetched = [];
    await verifyPublicOpenWidgetAssets({
      plan,
      fetchImpl: exactFetch(plan, (_response, asset) => fetched.push(asset.name)),
      baseUrl: 'https://example.test/mcp/app-assets/assets',
      timeoutMs: 100,
    });
    assert.deepEqual(
      fetched.filter((name) => name.startsWith('dexter-wallet-lockup-')).sort(),
      [
        'dexter-wallet-lockup-dark-EEEE.svg',
        'dexter-wallet-lockup-light-FFFF.svg',
      ],
    );

    for (const [mutation, expected] of [
      [
        (response, asset) => {
          if (asset.name === 'dexter-wallet-lockup-dark-EEEE.svg') {
            response.headers.get = () => 'text/plain';
          }
        },
        /dexter-wallet-lockup-dark-EEEE\.svg returned the wrong MIME type/,
      ],
      [
        (response, asset) => {
          if (asset.name === 'dexter-wallet-lockup-light-FFFF.svg') {
            response.arrayBuffer = async () => Buffer.from('changed SVG bytes');
          }
        },
        /dexter-wallet-lockup-light-FFFF\.svg differs from the sealed release/,
      ],
    ]) {
      await assert.rejects(
        verifyPublicOpenWidgetAssets({
          plan,
          fetchImpl: exactFetch(plan, mutation),
          baseUrl: 'https://example.test/mcp/app-assets/assets',
          timeoutMs: 100,
        }),
        expected,
      );
    }
  } finally {
    await chmod(current.release.releaseDir, 0o700);
    await chmod(join(current.release.releaseDir, 'public/apps-sdk'), 0o700);
    await chmod(current.releaseAssets, 0o700);
    await rm(current.root, { recursive: true, force: true });
  }
});

test('public gate also rejects a broken lazy chunk not named by widget HTML', async () => {
  const current = await fixture();
  try {
    const plan = await readOpenWidgetAssetPlan(current.release);
    assert.equal(
      plan.referencedAssets.some(({ name }) => name === 'lazy-DDDD.js'),
      false,
    );
    await assert.rejects(
      verifyPublicOpenWidgetAssets({
        plan,
        fetchImpl: exactFetch(plan, (response, asset) => {
          if (asset.name === 'lazy-DDDD.js') response.status = 404;
        }),
        baseUrl: 'https://example.test/mcp/app-assets/assets',
        timeoutMs: 100,
      }),
      /lazy-DDDD\.js returned HTTP 404/,
    );
  } finally {
    await chmod(current.release.releaseDir, 0o700);
    await chmod(join(current.release.releaseDir, 'public/apps-sdk'), 0o700);
    await chmod(current.releaseAssets, 0o700);
    await rm(current.root, { recursive: true, force: true });
  }
});

test('plan refuses missing and noncanonical HTML asset references', async () => {
  for (const body of [
    '<script src="./assets/missing-AAAA.js"></script>',
    '<img src="./assets/unsupported-AAAA.png">',
    "<script src='./assets/entry-AAAA.js'></script>",
    '<script src=./assets/entry-AAAA.js></script>',
  ]) {
    const current = await fixture();
    try {
      await chmod(current.release.releaseDir, 0o700);
      await chmod(join(current.release.releaseDir, 'public/apps-sdk'), 0o700);
      await writeFile(join(
        current.release.releaseDir,
        'public/apps-sdk/widget.html',
      ), body);
      await chmod(join(current.release.releaseDir, 'public/apps-sdk'), 0o500);
      await chmod(current.release.releaseDir, 0o500);
      await assert.rejects(
        readOpenWidgetAssetPlan(current.release),
        /missing release asset|noncanonical asset reference|unparsed asset reference|not one exact supported asset name/,
      );
    } finally {
      await chmod(current.release.releaseDir, 0o700);
      await chmod(join(current.release.releaseDir, 'public/apps-sdk'), 0o700);
      await chmod(current.releaseAssets, 0o700);
      await rm(current.root, { recursive: true, force: true });
    }
  }
});

test('plan fails closed on every unsupported or non-regular asset entry', async () => {
  const cases = [
    {
      name: 'unsupported extension',
      prepare: (current) => writeFile(
        join(current.releaseAssets, 'image-GGGG.png'),
        'unsupported image bytes\n',
      ),
      expected: /is not one exact supported asset name/,
    },
    {
      name: 'unsafe basename',
      prepare: (current) => writeFile(
        join(current.releaseAssets, '.hidden-HHHH.js'),
        'export {};\n',
      ),
      expected: /is not one exact supported asset name/,
    },
    {
      name: 'directory entry',
      prepare: (current) => mkdir(join(current.releaseAssets, 'nested')),
      expected: /is not one exact regular file/,
    },
  ];
  for (const { name, prepare, expected } of cases) {
    const current = await fixture();
    try {
      await chmod(current.releaseAssets, 0o700);
      await prepare(current);
      await chmod(current.releaseAssets, 0o500);
      await assert.rejects(
        readOpenWidgetAssetPlan(current.release),
        expected,
        name,
      );
    } finally {
      await chmod(current.release.releaseDir, 0o700);
      await chmod(join(current.release.releaseDir, 'public/apps-sdk'), 0o700);
      await chmod(current.releaseAssets, 0o700);
      await rm(current.root, { recursive: true, force: true });
    }
  }
});
