import { constants as fsConstants } from 'node:fs';
import {
  chmod,
  copyFile,
  link,
  lstat,
  readFile,
  readdir,
  realpath,
  unlink,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

export const PRODUCTION_WIDGET_ASSET_ROOT =
  '/home/branchmanager/websites/dexter-fe/public/mcp/app-assets';
export const PUBLIC_WIDGET_ASSET_BASE_URL =
  'https://dexter.cash/mcp/app-assets/assets';

const SHA256 = /^[0-9a-f]{64}$/;
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:css|js|svg)$/;
const SOURCE_MAP_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.map$/;
const MIME_BY_EXTENSION = Object.freeze({
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.svg': 'image/svg+xml',
});
const DEFAULT_PUBLIC_TIMEOUT_MS = 5_000;
const DEFAULT_PUBLIC_CONCURRENCY = 8;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactAssetName(value, label) {
  if (typeof value !== 'string' || !ASSET_NAME.test(value)) {
    throw new Error(`${label} is not one exact supported asset name`);
  }
  return value;
}

function extension(name) {
  const suffix = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (!Object.hasOwn(MIME_BY_EXTENSION, suffix)) {
    throw new Error(`OpenDexter asset has an unsupported extension: ${name}`);
  }
  return suffix;
}

async function exactOwnedDirectory(path, label) {
  const absolute = resolve(path);
  const stat = await lstat(absolute);
  if (
    !stat.isDirectory()
    || stat.isSymbolicLink()
    || stat.uid !== process.getuid()
    || (stat.mode & 0o022) !== 0
    || await realpath(absolute) !== absolute
  ) {
    throw new Error(`${label} is not one exact owned non-writable directory`);
  }
  return absolute;
}

async function exactRegularFile(path, label) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} is not one exact regular file`);
  }
  return stat;
}

function referencedAssetNames(html, htmlName) {
  const referenced = [];
  const localAssetReference =
    /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match;
  while ((match = localAssetReference.exec(html)) !== null) {
    const value = match[1] ?? match[2] ?? match[3];
    if (!value.startsWith('./assets/')) continue;
    if (match[1] === undefined) {
      throw new Error(
        `OpenDexter widget ${htmlName} uses a noncanonical asset reference`,
      );
    }
    referenced.push(exactAssetName(
      value.slice('./assets/'.length),
      `OpenDexter widget ${htmlName} asset reference`,
    ));
  }
  const rawReferenceCount = html.match(/\.\/assets\//g)?.length ?? 0;
  if (rawReferenceCount !== referenced.length) {
    throw new Error(
      `OpenDexter widget ${htmlName} contains an unparsed asset reference`,
    );
  }
  return referenced;
}

/**
 * Read every admitted Vite runtime file from one already-verified immutable
 * release. The asset directory is the manifest: JS, CSS, and SVG files are
 * sealed; regular source maps are ignored; every other entry fails closed.
 */
export async function readOpenWidgetAssetPlan(release) {
  if (typeof release?.releaseDir !== 'string') {
    throw new Error('OpenDexter widget assets require one sealed release');
  }
  const appsRoot = await exactOwnedDirectory(
    join(release.releaseDir, 'public/apps-sdk'),
    'OpenDexter widget root',
  );
  const assetsRoot = await exactOwnedDirectory(
    join(appsRoot, 'assets'),
    'OpenDexter widget asset root',
  );
  const htmlNames = (await readdir(appsRoot))
    .filter((name) => name.endsWith('.html'))
    .sort();
  if (htmlNames.length === 0) {
    throw new Error('OpenDexter release contains no widget HTML');
  }

  const referenced = new Set();
  for (const htmlName of htmlNames) {
    exactAssetName(`${htmlName.slice(0, -5)}.js`, 'widget HTML identity');
    const htmlPath = join(appsRoot, htmlName);
    await exactRegularFile(htmlPath, `OpenDexter widget ${htmlName}`);
    for (const name of referencedAssetNames(
      await readFile(htmlPath, 'utf8'),
      htmlName,
    )) {
      referenced.add(name);
    }
  }
  if (referenced.size === 0) {
    throw new Error('OpenDexter widget HTML references no JS/CSS assets');
  }

  const assets = [];
  for (const name of (await readdir(assetsRoot)).sort()) {
    const source = join(assetsRoot, name);
    const stat = await exactRegularFile(
      source,
      `OpenDexter release asset ${name}`,
    );
    if (SOURCE_MAP_NAME.test(name)) continue;
    exactAssetName(name, 'OpenDexter release asset');
    const content = await readFile(source);
    assets.push(Object.freeze({
      name,
      source,
      bytes: stat.size,
      sha256: sha256(content),
      mime: MIME_BY_EXTENSION[extension(name)],
      referenced: referenced.has(name),
    }));
  }
  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  for (const name of referenced) {
    if (!byName.has(name)) {
      throw new Error(`OpenDexter widget references missing release asset ${name}`);
    }
  }
  if (!assets.some(({ name }) => name.endsWith('.js') || name.endsWith('.css'))) {
    throw new Error('OpenDexter release contains no JS/CSS widget assets');
  }
  return Object.freeze({
    releaseDir: release.releaseDir,
    assets: Object.freeze(assets),
    referencedAssets: Object.freeze(
      [...referenced].sort().map((name) => byName.get(name)),
    ),
  });
}

async function exactDeployedAsset(path, asset) {
  let stat;
  try {
    stat = await exactRegularFile(path, `deployed OpenDexter asset ${asset.name}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (
    stat.uid !== process.getuid()
    || stat.size !== asset.bytes
    || sha256(await readFile(path)) !== asset.sha256
  ) {
    throw new Error(`deployed OpenDexter asset conflicts with ${asset.name}`);
  }
  return true;
}

/**
 * Append the sealed release's runtime assets to the Nginx tree. Existing hashes
 * are never removed or overwritten: exact matches are reused and conflicts
 * fail closed. A temporary hard-link publish keeps new names from becoming
 * visible with partial bytes.
 */
export async function publishOpenWidgetAssets({
  plan,
  targetRoot = PRODUCTION_WIDGET_ASSET_ROOT,
} = {}) {
  if (!Array.isArray(plan?.assets) || plan.assets.length === 0) {
    throw new Error('OpenDexter widget publish requires one exact asset plan');
  }
  const root = await exactOwnedDirectory(
    targetRoot,
    'OpenDexter public widget root',
  );
  const targetAssets = await exactOwnedDirectory(
    join(root, 'assets'),
    'OpenDexter public widget asset root',
  );
  let added = 0;
  for (const asset of plan.assets) {
    exactAssetName(asset.name, 'OpenDexter release asset');
    if (!SHA256.test(asset.sha256)) {
      throw new Error(`OpenDexter release asset digest is invalid: ${asset.name}`);
    }
    if (sha256(await readFile(asset.source)) !== asset.sha256) {
      throw new Error(`sealed OpenDexter release asset changed: ${asset.name}`);
    }
    const destination = join(targetAssets, asset.name);
    if (await exactDeployedAsset(destination, asset)) continue;
    const temporary = join(
      targetAssets,
      `.${asset.name}.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
      await copyFile(asset.source, temporary, fsConstants.COPYFILE_EXCL);
      await chmod(temporary, 0o444);
      try {
        await link(temporary, destination);
        added += 1;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
    } finally {
      await unlink(temporary).catch(() => {});
    }
    if (!await exactDeployedAsset(destination, asset)) {
      throw new Error(`OpenDexter asset publish did not install ${asset.name}`);
    }
  }
  return Object.freeze({ added, retained: plan.assets.length - added });
}

function responseContentType(response) {
  return String(response?.headers?.get?.('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

async function fetchAssetExactly({ asset, baseUrl, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  let timer;
  try {
    const operation = (async () => {
      const response = await fetchImpl(
        `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(asset.name)}`,
        {
          method: 'GET',
          cache: 'no-store',
          redirect: 'error',
          signal: controller.signal,
        },
      );
      if (response?.status !== 200 || response?.redirected === true) {
        throw new Error(
          `public OpenDexter asset ${asset.name} returned HTTP ${response?.status}`,
        );
      }
      if (responseContentType(response) !== asset.mime) {
        throw new Error(
          `public OpenDexter asset ${asset.name} returned the wrong MIME type`,
        );
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) {
        throw new Error(
          `public OpenDexter asset ${asset.name} differs from the sealed release`,
        );
      }
    })();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`public OpenDexter asset ${asset.name} timed out`));
      }, timeoutMs);
    });
    await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Verify every shipped runtime asset through its exact public URL. */
export async function verifyPublicOpenWidgetAssets({
  plan,
  fetchImpl = fetch,
  baseUrl = PUBLIC_WIDGET_ASSET_BASE_URL,
  timeoutMs = DEFAULT_PUBLIC_TIMEOUT_MS,
  concurrency = DEFAULT_PUBLIC_CONCURRENCY,
} = {}) {
  if (
    !Array.isArray(plan?.assets)
    || plan.assets.length === 0
    || typeof fetchImpl !== 'function'
    || typeof baseUrl !== 'string'
    || !baseUrl.startsWith('https://')
    || !Number.isInteger(timeoutMs)
    || timeoutMs <= 0
    || !Number.isInteger(concurrency)
    || concurrency <= 0
  ) {
    throw new Error('OpenDexter public widget verification input is invalid');
  }
  let cursor = 0;
  const worker = async () => {
    while (cursor < plan.assets.length) {
      const asset = plan.assets[cursor];
      cursor += 1;
      await fetchAssetExactly({ asset, baseUrl, fetchImpl, timeoutMs });
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(concurrency, plan.assets.length) },
    worker,
  ));
  return true;
}

export async function publishAndVerifyOpenWidgetAssets(options = {}) {
  const plan = await readOpenWidgetAssetPlan(options.release);
  await publishOpenWidgetAssets({ plan, targetRoot: options.targetRoot });
  await verifyPublicOpenWidgetAssets({
    plan,
    fetchImpl: options.fetchImpl,
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
  });
  return plan;
}
