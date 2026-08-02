import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCTION_PM2_EXECUTABLE,
  runBoundedPm2Command,
  samePm2ProcessSnapshot,
  snapshotUnrelatedPm2Processes,
} from '../lib/open-release-pm2-safety.mjs';

const RELEASE_SERVICES = ['dexter-open-mcp'];

test('unrelated PM2 snapshot binds configuration while ignoring runtime counters', () => {
  const live = [{
    name: 'other-service',
    pid: 123,
    pm2_env: {
      status: 'online',
      pm_id: 7,
      pm_uptime: 10,
      restart_time: 1,
      pm_exec_path: '/srv/other/server.mjs',
      pm_cwd: '/srv/other',
      autorestart: true,
      OTHER_SECRET: 'opaque',
      OTHER_PORT: '4010',
      env: {
        OTHER_SECRET: 'opaque',
        OTHER_PORT: '4010',
        pm_exec_path: '/environment-value-not-process-path',
      },
    },
  }, {
    name: 'dexter-mcp',
    pm2_env: { pm_exec_path: '/old/private.mjs' },
  }];
  const saved = [{
    name: 'other-service',
    status: 'stopped',
    pm_id: 99,
    pm_uptime: 999,
    restart_time: 8,
    pm_exec_path: '/srv/other/server.mjs',
    pm_cwd: '/srv/other',
    autorestart: true,
    OTHER_SECRET: 'opaque',
    OTHER_PORT: '4010',
    env: {
      OTHER_SECRET: 'opaque',
      OTHER_PORT: '4010',
      pm_exec_path: '/environment-value-not-process-path',
    },
    'other-service': true,
  }, {
    name: 'dexter-mcp',
    pm_exec_path: '/old/private.mjs',
  }];

  const liveSnapshot = snapshotUnrelatedPm2Processes(live, RELEASE_SERVICES);
  const savedSnapshot = snapshotUnrelatedPm2Processes(saved, RELEASE_SERVICES);
  assert.equal(samePm2ProcessSnapshot(liveSnapshot, savedSnapshot), true);

  const changed = structuredClone(saved);
  changed[0].OTHER_PORT = '4011';
  assert.equal(samePm2ProcessSnapshot(
    liveSnapshot,
    snapshotUnrelatedPm2Processes(changed, RELEASE_SERVICES),
  ), false);

  const changedDefinition = structuredClone(saved);
  changedDefinition[0].pm_exec_path = '/srv/other/attacker.mjs';
  assert.equal(samePm2ProcessSnapshot(
    liveSnapshot,
    snapshotUnrelatedPm2Processes(changedDefinition, RELEASE_SERVICES),
  ), false);

  const changedCollidingEnvironment = structuredClone(saved);
  changedCollidingEnvironment[0].env.pm_exec_path = '/environment-attacker';
  assert.equal(samePm2ProcessSnapshot(
    liveSnapshot,
    snapshotUnrelatedPm2Processes(
      changedCollidingEnvironment,
      RELEASE_SERVICES,
    ),
  ), false);
});

test('fallback PM2 rows ignore top-level runtime pid', () => {
  const left = snapshotUnrelatedPm2Processes([{
    name: 'other',
    pid: 10,
    pm_exec_path: '/srv/other/server.mjs',
  }], RELEASE_SERVICES);
  const right = snapshotUnrelatedPm2Processes([{
    name: 'other',
    pid: 99,
    pm_exec_path: '/srv/other/server.mjs',
  }], RELEASE_SERVICES);
  assert.equal(samePm2ProcessSnapshot(left, right), true);
});

test('unrelated PM2 snapshot refuses duplicate or missing names', () => {
  assert.throws(
    () => snapshotUnrelatedPm2Processes([{ name: '' }], RELEASE_SERVICES),
    /unique strings/,
  );
  assert.throws(
    () => snapshotUnrelatedPm2Processes([
      { name: 'other' },
      { name: 'other' },
    ], RELEASE_SERVICES),
    /unique strings/,
  );
});

test('bounded PM2 command ignores hostile PATH and uses the exact production binary', async () => {
  let received;
  const result = await runBoundedPm2Command({
    runCommand: async (command, args, options) => {
      received = { command, args, options };
      return { stdout: '[]' };
    },
    args: ['jlist'],
    commandEnvironment: { PATH: '/tmp/hostile-user-bin:/usr/bin' },
    timeoutMs: 50,
  });
  assert.equal(result.stdout, '[]');
  assert.equal(received.command, PRODUCTION_PM2_EXECUTABLE);
  assert.deepEqual(received.args, ['jlist']);
  assert.equal(received.options.timeout, 50);
  assert.equal(received.options.killSignal, 'SIGKILL');
  assert.equal(received.options.signal instanceof AbortSignal, true);
});

test('bounded PM2 command rejects a runner that never settles', async () => {
  const started = Date.now();
  await assert.rejects(
    runBoundedPm2Command({
      runCommand: async () => new Promise(() => {}),
      args: ['save', '--force'],
      commandEnvironment: {},
      timeoutMs: 20,
    }),
    /PM2 save timed out after 20ms/,
  );
  assert.ok(Date.now() - started < 500);
});

test('PM2 command failures never expose stdout, stderr, messages, or hostile metadata', async () => {
  const sentinel = 'DO_NOT_EXPOSE_PM2_ENV_SECRET';
  let failure;
  try {
    await runBoundedPm2Command({
      runCommand: async () => {
        const error = new Error(`raw ${sentinel}`);
        error.stdout = JSON.stringify({ GOVERNED_SECRET: sentinel });
        error.stderr = `stderr ${sentinel}`;
        error.code = `E_${sentinel}`;
        error.signal = `SIG_${sentinel}`;
        throw error;
      },
      args: [`jlist-${sentinel}`],
      commandEnvironment: {},
      timeoutMs: 20,
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.message, 'PM2 command failed');
  assert.equal(JSON.stringify(failure).includes(sentinel), false);
  assert.equal(failure?.cause, undefined);
  assert.equal(failure?.stdout, undefined);
  assert.equal(failure?.stderr, undefined);

  await assert.rejects(
    runBoundedPm2Command({
      runCommand: async () => {
        const error = new Error(sentinel);
        error.code = 7;
        error.signal = 'SIGTERM';
        throw error;
      },
      args: ['jlist'],
      commandEnvironment: {},
      timeoutMs: 20,
    }),
    (error) => error.message === 'PM2 jlist failed (exit=7,signal=SIGTERM)'
      && !error.message.includes(sentinel),
  );
});
