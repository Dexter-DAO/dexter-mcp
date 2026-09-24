import { createHash } from 'node:crypto';

const PROOF_KEYS = Object.freeze([
  'version', 'requestInputVersion', 'policy', 'status', 'resourceId', 'method',
  'checkRequestId', 'schemaSource', 'contractDigest', 'payloadDigest', 'bindingDigest',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FAILURE_STATUS = Object.freeze({
  unsupported_version: 400,
  target_not_supported: 400,
  method_not_supported: 400,
  body_missing: 400,
  body_invalid_json: 400,
  body_duplicate_key: 400,
  body_invalid: 400,
  version_required: 409,
  schema_unavailable: 409,
  schema_unsupported: 409,
  body_too_large: 413,
});

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Reflect.ownKeys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Read only authenticated API proof; the caller marker is never evidence. */
export function parseIndexterRequestInputValidation(value, {
  checkRequestId,
  resourceId,
  method,
  rawBody,
  rawBodyProvided = false,
  recoveredCheck = false,
} = {}) {
  if (!exactKeys(value, PROOF_KEYS)
    || value.version !== 1 || value.requestInputVersion !== 2
    || value.policy !== 'current_catalog' || value.status !== 'validated'
    || typeof value.resourceId !== 'string' || !UUID.test(value.resourceId)
    || !['POST', 'PUT', 'DELETE'].includes(value.method)
    || typeof checkRequestId !== 'string' || !REQUEST_ID.test(checkRequestId)
    || value.checkRequestId !== checkRequestId
    || !['bazaar', 'openapi', 'profile'].includes(value.schemaSource)
    || ![value.contractDigest, value.payloadDigest, value.bindingDigest]
      .every((digest) => typeof digest === 'string' && DIGEST.test(digest))) return undefined;

  const bindingDigest = sha256(JSON.stringify([
    'dexter.indexter.request-input-validation/v1', 2, value.resourceId,
    value.method, value.checkRequestId, value.schemaSource,
    value.contractDigest, value.payloadDigest,
  ]));
  if (value.bindingDigest !== bindingDigest) return undefined;
  if (!recoveredCheck && (typeof resourceId !== 'string' || typeof method !== 'string' || !rawBodyProvided)) {
    return undefined;
  }
  if (resourceId !== undefined
    && (typeof resourceId !== 'string' || resourceId.toLowerCase() !== value.resourceId)) return undefined;
  if (method !== undefined && method !== value.method) return undefined;
  if (rawBodyProvided
    && (typeof rawBody !== 'string' || Buffer.byteLength(rawBody, 'utf8') > 262144
      || sha256(rawBody) !== value.payloadDigest)) return undefined;
  return Object.fromEntries(PROOF_KEYS.map((key) => [key, value[key]]));
}

/** The finite refusal contains no schema, body, parser detail, or intent. */
export function parseIndexterRequestInputFailure(checkResult, checkRequestId) {
  const value = checkResult?.requestInputFailure;
  if (checkResult?.ok !== false || checkResult.error !== 'indexter_request_input_invalid'
    || checkResult.retryable !== false
    || typeof checkRequestId !== 'string' || !REQUEST_ID.test(checkRequestId)
    || checkResult.checkRequestId !== checkRequestId
    || !exactKeys(value, ['version', 'code']) || value.version !== 2
    || typeof value.code !== 'string' || !Object.hasOwn(FAILURE_STATUS, value.code)
    || (checkResult.httpStatus !== undefined && checkResult.httpStatus !== FAILURE_STATUS[value.code])) {
    return undefined;
  }
  return { version: 2, code: value.code };
}
