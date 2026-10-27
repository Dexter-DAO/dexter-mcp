export class IndexterDeadlineError extends Error {
  constructor() {
    super('Indexter request timed out.');
    this.name = 'IndexterDeadlineError';
  }
}

/** Bound the complete read, including response bodies, by the earliest deadline. */
export async function withIndexterDeadline(read, {
  timeoutMs = 20_000,
  signal,
  deadlineUnixMs,
} = {}) {
  signal?.throwIfAborted();
  const remainingMs = Number.isSafeInteger(deadlineUnixMs)
    ? Math.min(timeoutMs, deadlineUnixMs - Date.now())
    : timeoutMs;
  if (remainingMs <= 0) throw new IndexterDeadlineError();

  const controller = new AbortController();
  const onCallerAbort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new IndexterDeadlineError()), remainingMs);
  let onAbort;
  const deadline = new Promise((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([read(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
