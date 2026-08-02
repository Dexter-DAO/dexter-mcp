import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { startOpenReleaseCandidate } from '../scripts/release/open-release-core.mjs';

const execFileAsync = promisify(execFile);

async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw lastError ?? new Error('disposable PM2 integration timed out');
}

function privateTuple(row) {
  return {
    name: row.name,
    pmId: row.pm_id,
    pid: row.pid,
    status: row.pm2_env.status,
    restartTime: row.pm2_env.restart_time,
    unstableRestarts: row.pm2_env.unstable_restarts,
    cwd: row.pm2_env.pm_cwd,
    script: row.pm2_env.pm_exec_path,
    interpreter: row.pm2_env.exec_interpreter,
    marker: row.pm2_env.env.PRIVATE_RUNTIME_MARKER,
  };
}

async function kernelTuple(row) {
  const stat = await readFile(`/proc/${row.pid}/stat`, 'utf8');
  const statTail = stat.slice(stat.lastIndexOf(') ') + 2).trim().split(/\s+/);
  return {
    cwd: await readlink(`/proc/${row.pid}/cwd`),
    executable: await readlink(`/proc/${row.pid}/exe`),
    commandLine: (await readFile(`/proc/${row.pid}/cmdline`, 'utf8'))
      .split('\0').filter(Boolean),
    startTimeTicks: statTail[19],
  };
}

test('real disposable PM2 save/delete/start/resurrect never restarts private runtime', {
  timeout: 30_000,
}, async (t) => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'opendexter-real-pm2-'));
  const pm2Home = resolve(fixture, 'pm2');
  const privateScript = resolve(fixture, 'private.mjs');
  const oldOpenScript = resolve(fixture, 'old-open.mjs');
  const newOpenScript = resolve(fixture, 'new-open.mjs');
  const child = 'setInterval(() => {}, 1000);\n';
  await writeFile(privateScript, child);
  await writeFile(oldOpenScript, child);
  await writeFile(newOpenScript, child);
  const environment = {
    ...process.env,
    PM2_HOME: pm2Home,
    PRIVATE_RUNTIME_MARKER: 'must-remain-exact',
  };
  const pm2 = async (...args) => execFileAsync('pm2', args, {
    encoding: 'utf8',
    env: environment,
    timeout: 10_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const list = async () => JSON.parse((await pm2('jlist')).stdout);
  t.after(async () => {
    await pm2('kill').catch(() => {});
    await rm(fixture, { recursive: true, force: true });
  });

  await pm2('start', privateScript, '--name', 'dexter-mcp', '--cwd', fixture);
  await pm2('start', oldOpenScript, '--name', 'dexter-open-mcp', '--cwd', fixture);
  const initial = await waitFor(async () => {
    const rows = await list();
    return rows.length === 2
      && rows.every((row) => row.pm2_env.status === 'online')
      ? rows
      : null;
  });
  const privateBefore = initial.find((row) => row.name === 'dexter-mcp');
  const openBefore = initial.find((row) => row.name === 'dexter-open-mcp');
  const privateIdentity = privateTuple(privateBefore);
  const privateKernel = await kernelTuple(privateBefore);
  await pm2('save', '--force');
  const savedPrior = JSON.parse(await readFile(resolve(pm2Home, 'dump.pm2'), 'utf8'));
  const savedOpenOnly = savedPrior.filter(
    (row) => row.name === 'dexter-open-mcp',
  );
  assert.equal(savedOpenOnly.length, 1);

  await pm2('delete', 'dexter-open-mcp');
  await pm2('start', newOpenScript, '--name', 'dexter-open-mcp', '--cwd', fixture);
  const afterCandidate = await waitFor(async () => {
    const rows = await list();
    const candidate = rows.find((row) => row.name === 'dexter-open-mcp');
    return candidate?.pm2_env.pm_exec_path === newOpenScript ? rows : null;
  });
  assert.deepEqual(
    privateTuple(afterCandidate.find((row) => row.name === 'dexter-mcp')),
    privateIdentity,
  );
  assert.deepEqual(
    await kernelTuple(afterCandidate.find((row) => row.name === 'dexter-mcp')),
    privateKernel,
  );
  const candidateOpen = afterCandidate.find(
    (row) => row.name === 'dexter-open-mcp',
  );
  assert.notEqual(candidateOpen.pm_id, openBefore.pm_id);
  assert.ok(candidateOpen.pm_id > openBefore.pm_id);

  // PM2 does not replace an existing app during resurrect. A rollback path
  // that failed to delete the candidate would therefore leave the wrong code
  // running even though the prior dump is valid.
  await writeFile(resolve(pm2Home, 'dump.pm2'), JSON.stringify(savedOpenOnly));
  await pm2('resurrect');
  const skippedRestore = await list();
  const stillCandidate = skippedRestore.find(
    (row) => row.name === 'dexter-open-mcp',
  );
  assert.equal(stillCandidate.pm2_env.pm_exec_path, newOpenScript);
  assert.equal(stillCandidate.pm_id, candidateOpen.pm_id);
  assert.deepEqual(
    privateTuple(skippedRestore.find((row) => row.name === 'dexter-mcp')),
    privateIdentity,
  );
  assert.deepEqual(
    await kernelTuple(skippedRestore.find((row) => row.name === 'dexter-mcp')),
    privateKernel,
  );

  await pm2('delete', 'dexter-open-mcp');
  await writeFile(resolve(pm2Home, 'dump.pm2'), JSON.stringify(savedOpenOnly));
  await pm2('resurrect');
  const restored = await waitFor(async () => {
    const rows = await list();
    const open = rows.find((row) => row.name === 'dexter-open-mcp');
    return open?.pm2_env.pm_exec_path === oldOpenScript
      && open.pm2_env.status === 'online'
      ? rows
      : null;
  });
  const privateAfter = restored.find((row) => row.name === 'dexter-mcp');
  const openAfter = restored.find((row) => row.name === 'dexter-open-mcp');
  assert.deepEqual(privateTuple(privateAfter), privateIdentity);
  assert.deepEqual(await kernelTuple(privateAfter), privateKernel);
  assert.notEqual(openAfter.pid, openBefore.pid);
  assert.notEqual(openAfter.pm_id, openBefore.pm_id);
  assert.ok(openAfter.pm_id > candidateOpen.pm_id);
  assert.equal(openAfter.pm2_env.pm_exec_path, oldOpenScript);
  assert.equal(openAfter.pm2_env.pm_cwd, fixture);
});

test('real disposable PM2 loads the sealed non-config filename through an exact app selector', {
  timeout: 30_000,
}, async (t) => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'opendexter-real-config-'));
  const pm2Home = resolve(fixture, 'pm2');
  const publicScript = resolve(fixture, 'public.mjs');
  const ecosystem = resolve(fixture, 'ecosystem.production.cjs');
  await mkdir(pm2Home, { mode: 0o700 });
  await writeFile(publicScript, 'setInterval(() => {}, 1000);\n');
  await writeFile(ecosystem, [
    'module.exports = {',
    '  apps: [{',
    "    name: 'dexter-open-mcp',",
    `    script: ${JSON.stringify(publicScript)},`,
    `    cwd: ${JSON.stringify(fixture)},`,
    '  }],',
    '};',
    '',
  ].join('\n'));
  const environment = {
    ...process.env,
    PM2_HOME: pm2Home,
  };
  const pm2 = async (...args) => execFileAsync('pm2', args, {
    encoding: 'utf8',
    env: environment,
    timeout: 10_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const list = async () => JSON.parse((await pm2('jlist')).stdout);
  t.after(async () => {
    await pm2('kill').catch(() => {});
    await rm(fixture, { recursive: true, force: true });
  });

  // This is the exact production failure boundary: ecosystem.production.cjs
  // is not a PM2-recognized config suffix. The helper must never pass it as
  // the program argument and must leave only the declared public process.
  await startOpenReleaseCandidate({
    ecosystem,
    pm2Home,
    runPm2: (args) => pm2(...args),
  });
  const rows = await waitFor(async () => {
    const current = await list();
    return current.length === 1 && current[0].pm2_env.status === 'online'
      ? current
      : null;
  });
  assert.equal(rows[0].name, 'dexter-open-mcp');
  assert.equal(rows[0].pm2_env.pm_exec_path, publicScript);
  assert.equal(rows.some((row) => row.name === 'ecosystem.production'), false);
});
