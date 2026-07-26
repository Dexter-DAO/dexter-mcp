import { createHmac } from 'node:crypto';

export function createLogRef(redactionKey) {
  const key = String(redactionKey || '');
  if (!key) throw new TypeError('A non-empty log redaction key is required');
  return (value) => {
    if (value === undefined || value === null || value === '') return 'none';
    return createHmac('sha256', key)
      .update(String(value))
      .digest('hex')
      .slice(0, 12);
  };
}

export function safeErrorLabel(error) {
  const name =
    typeof error?.name === 'string' && /^[a-z0-9_.:-]{1,64}$/i.test(error.name)
      ? error.name
      : 'Error';
  const code =
    typeof error?.code === 'string' && /^[a-z0-9_.:-]{1,64}$/i.test(error.code)
      ? error.code
      : null;
  return code ? `${name}:${code}` : name;
}

export function safeUrlOrigin(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return 'invalid-url';
  }
}
