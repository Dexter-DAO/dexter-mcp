import assert from 'node:assert/strict';
import test from 'node:test';

import { IndexterDeadlineError, withIndexterDeadline } from '../lib/indexter-deadline.mjs';

test('a read completed just before its deadline is retained', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish;
  let signal;
  const result = withIndexterDeadline((readSignal) => {
    signal = readSignal;
    return new Promise((resolve) => { finish = resolve; });
  }, { timeoutMs: 4_000 });
  t.mock.timers.tick(3_999);
  finish('complete');
  assert.equal(await result, 'complete');
  t.mock.timers.tick(1);
  assert.equal(signal.aborted, false, 'completion removes the deadline timer');
});

test('deadline aborts an unfinished read and ignores its later completion', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish;
  let signal;
  const result = withIndexterDeadline((readSignal) => {
    signal = readSignal;
    return new Promise((resolve) => { finish = resolve; });
  }, { timeoutMs: 4_000 });
  const rejected = assert.rejects(result, IndexterDeadlineError);
  t.mock.timers.tick(4_000);
  await rejected;
  assert.equal(signal.aborted, true);
  finish('too late');
  await Promise.resolve();
});

test('an earlier absolute caller deadline shortens the default limit', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const result = withIndexterDeadline(() => new Promise(() => {}), {
    deadlineUnixMs: Date.now() + 500,
  });
  const rejected = assert.rejects(result, IndexterDeadlineError);
  t.mock.timers.tick(500);
  await rejected;
  let called = false;
  await assert.rejects(withIndexterDeadline(() => { called = true; }, {
    deadlineUnixMs: Date.now() - 1,
  }), IndexterDeadlineError);
  assert.equal(called, false);
});

test('caller cancellation aborts the read and an already cancelled call never starts', async () => {
  const caller = new AbortController();
  let signal;
  const result = withIndexterDeadline((readSignal) => {
    signal = readSignal;
    return new Promise(() => {});
  }, { signal: caller.signal });
  const failure = new Error('caller cancelled');
  const rejected = assert.rejects(result, (error) => error === failure);
  caller.abort(failure);
  await rejected;
  assert.equal(signal.reason, failure);
  let called = false;
  await assert.rejects(withIndexterDeadline(() => { called = true; }, {
    signal: caller.signal,
  }), (error) => error === failure);
  assert.equal(called, false);
});
