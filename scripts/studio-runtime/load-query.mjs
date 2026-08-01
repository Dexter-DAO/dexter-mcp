const QUERY_MODULE_URL = new URL('./query.mjs', import.meta.url);

export async function loadStudioQuery(moduleUrl = QUERY_MODULE_URL) {
  try {
    const runtime = await import(moduleUrl.href ?? moduleUrl);
    if (typeof runtime.query !== 'function') {
      throw new TypeError('Studio runtime does not export query()');
    }
    return runtime.query;
  } catch (cause) {
    const error = new Error(
      'Dexter Studio runtime is unavailable; install its pinned isolated '
        + 'dependencies with npm run studio:setup',
      { cause },
    );
    error.code = 'studio_runtime_unavailable';
    throw error;
  }
}
