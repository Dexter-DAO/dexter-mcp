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
  await writeFile(join(releaseAssets, 'entry-AAAA.js'), 'export const ok = true;\n');
  await writeFile(join(releaseAssets, 'entry-BBBB.css'), '.ok { color: green; }\n');
  await writeFile(join(releaseAssets, 'dynamic-CCCC.js'), 'export const later = true;\n');
  await writeFile(join(releaseAssets, 'lazy-DDDD.js'), 'export const lazy = true;\n');
  await writeFile(join(releaseAssets, 'entry-AAAA.js.map'), '{}\n');
  await writeFile(join(appsRoot, 'widget.html'), [
    '<!doctype html>',
    '<link rel="stylesheet" href="./assets/entry-BBBB.css">',
    '<link rel="modulepreload" href="./assets/dynamic-CCCC.js">',
    '<script type="module" src="./assets/entry-AAAA.js"></script>',
  ].join('\n'));
  await writeFile(join(targetAssets, 'historical-OLD.js'), 'old bytes stay\n');
  await chmod(releaseDir, 0o500);
  return {
    root,
    release: { releaseDir },
    releaseAssets,
    targetRoot,
    targetAssets,
  };
}

test('sealed release plan binds every HTML reference and all JS/CSS bytes', async () => {
  const current = await fixture();
  try {
    const plan = await readOpenWidgetAssetPlan(current.release);
    assert.deepEqual(plan.assets.map(({ name }) => name), [
      'dynamic-CCCC.js',
      'entry-AAAA.js',
      'entry-BBBB.css',
      'lazy-DDDD.js',
    ]);
    assert.deepEqual(plan.referencedAssets.map(({ name, mime }) => [name, mime]), [
      ['dynamic-CCCC.js', 'application/javascript'],
      ['entry-AAAA.js', 'application/javascript'],
      ['entry-BBBB.css', 'text/css'],
    ]);
  } finally {
    await chmod(current.release.releaseDir, 0o700);
    await rm(current.root, { recursive: true, force: true });
  }
});

test('publish is append-only, atomic by name, and refuses a hash collision', async () => {
  const current = await fixture();
  try {
    const plan = await readOpenWidgetAssetPlan(current.release);
    assert.deepEqual(
      await publishOpenWidgetAssets({ plan, targetRoot: current.targetRoot }),
      { added: 4, retained: 0 },
    );
    assert.equal(
      await readFile(join(current.targetAssets, 'historical-OLD.js'), 'utf8'),
      'old bytes stay\n',
    );
    assert.deepEqual(
      await publishOpenWidgetAssets({ plan, targetRoot: current.targetRoot }),
      { added: 0, retained: 4 },
    );
    await chmod(join(current.targetAssets, 'entry-AAAA.js'), 0o644);
    await writeFile(join(current.targetAssets, 'entry-AAAA.js'), 'hostile bytes\n');
    await assert.rejects(
      publishOpenWidgetAssets({ plan, targetRoot: current.targetRoot }),
      /conflicts with entry-AAAA\.js/,
    );
  } finally {
    await chmod(current.release.releaseDir, 0o700);
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
    await rm(current.root, { recursive: true, force: true });
  }
});

test('plan refuses missing and noncanonical HTML asset references', async () => {
  for (const body of [
    '<script src="./assets/missing-AAAA.js"></script>',
    "<script src='./assets/entry-AAAA.js'></script>",
    '<script src=./assets/entry-AAAA.js></script>',
  ]) {
    const current = await fixture();
    try {
      await chmod(current.release.releaseDir, 0o700);
      await writeFile(join(
        current.release.releaseDir,
        'public/apps-sdk/widget.html',
      ), body);
      await chmod(current.release.releaseDir, 0o500);
      await assert.rejects(
        readOpenWidgetAssetPlan(current.release),
        /missing release asset|noncanonical asset reference|unparsed asset reference/,
      );
    } finally {
      await chmod(current.release.releaseDir, 0o700);
      await rm(current.root, { recursive: true, force: true });
    }
  }
});
