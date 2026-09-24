import { isSafeIndexterDiscoveryString, isSafeIndexterObjectKey } from './indexter-discovery-policy.mjs';

const SCALARS = new Set(['boolean', 'integer', 'number', 'string']);
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const UNSAFE_NAME = /(?:assistant|bypass|developer|disregard|ignore|instructions?|override|prompt|system)/i;
const utf8 = new TextEncoder();
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysEqual = (value, keys) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function safeName(value) {
  return typeof value === 'string' && NAME.test(value)
    && !['constructor', 'prototype', '__proto__'].includes(value)
    && isSafeIndexterObjectKey(value)
    && (value === 'prompt' || !UNSAFE_NAME.test(value))
    && isSafeIndexterDiscoveryString(value);
}

/** Parse the complete v2 projection. A rejected member rejects the contract. */
export function parseIndexterRequestInputV2(value) {
  if (!isRecord(value) || !keysEqual(value, ['version', 'additionalProperties', 'fields'])
    || value.version !== 2 || value.additionalProperties !== false) return null;
  let count = 0;
  function fields(values, nested) {
    if (!Array.isArray(values) || values.length > 24) return null;
    const names = new Set();
    const parsed = [];
    for (const field of values) {
      if (!isRecord(field) || ++count > 24 || !safeName(field.name)
        || names.has(field.name) || field.location !== 'body'
        || typeof field.required !== 'boolean') return null;
      names.add(field.name);
      const common = { name: field.name, location: 'body', type: field.type, required: field.required };
      const keys = ['name', 'location', 'type', 'required'];
      if (field.type === 'object') {
        if (nested || !keysEqual(field, [...keys, 'additionalProperties', 'fields'])
          || field.additionalProperties !== false) return null;
        const children = fields(field.fields, true);
        if (!children) return null;
        parsed.push({ ...common, additionalProperties: false, fields: children });
      } else if (field.type === 'array') {
        if (nested || !keysEqual(field, [...keys, 'items', 'minItems', 'maxItems'])
          || !isRecord(field.items) || !keysEqual(field.items, ['type']) || !SCALARS.has(field.items.type)
          || !Number.isInteger(field.minItems) || field.minItems < 0
          || !Number.isInteger(field.maxItems) || field.maxItems < field.minItems || field.maxItems > 32) return null;
        parsed.push({ ...common, items: { type: field.items.type }, minItems: field.minItems, maxItems: field.maxItems });
      } else {
        const hasEnum = Object.hasOwn(field, 'enum');
        if (!SCALARS.has(field.type) || !keysEqual(field, hasEnum ? [...keys, 'enum'] : keys)) return null;
        if (hasEnum && (field.type !== 'string' || !Array.isArray(field.enum)
          || field.enum.length < 1 || field.enum.length > 16
          || field.enum.some((item) => typeof item !== 'string' || utf8.encode(item).byteLength > 128
            || !isSafeIndexterDiscoveryString(item))
          || new Set(field.enum).size !== field.enum.length)) return null;
        parsed.push({ ...common, ...(hasEnum ? { enum: [...field.enum].sort(compare) } : {}) });
      }
    }
    return parsed.sort((a, b) => compare(a.name, b.name));
  }
  const parsed = fields(value.fields, false);
  return parsed ? { version: 2, additionalProperties: false, fields: parsed } : null;
}


export const INDEXTER_V2_BODY_GUIDANCE = 'For version 2, keep each nested object and its child fields in place. Use only declared keys, types and string enum values. Ask for missing required values. A required object may be {} only when explicitly supplied and all children are optional; never invent it. Preserve array item types and length bounds. Keep numbers finite and integers within safe integer bounds. Keep the original JSON body string, with unique member names in every object and at most 256 KiB of UTF-8 bytes. Call x402_check with the selected resourceId, its POST/PUT/DELETE method, the original body and requestInputVersion:2. The API validates against the current catalog contract. A refusal ends this check; it does not authorize another check or payment. ';

const SCHEMA_ANNOTATIONS = new Set(['title', 'description', 'default', 'example', 'examples', '$schema']);
const STRUCTURAL = ['$ref', '$dynamicRef', 'oneOf', 'anyOf', 'allOf', 'if', 'then', 'else', 'not',
  'patternProperties', 'dependentSchemas', 'unevaluatedProperties', 'prefixItems'];

// COMMON-WIRE.v1 / API pure-helper.v2: classify before selecting the legacy parser.
export function classifyIndexterBodySchema(schema) {
  if (schema == null) return 'legacy';
  if (!isRecord(schema) || (schema.type !== undefined && schema.type !== 'object')
    || (schema.properties !== undefined && !isRecord(schema.properties))) return 'unavailable';
  const children = Object.values(schema.properties ?? {});
  if (children.some((child) => isRecord(child) && (child.type === 'object' || Object.hasOwn(child, 'properties')))) {
    return 'nested';
  }
  if (schema.additionalProperties !== false || STRUCTURAL.some((key) => Object.hasOwn(schema, key))) return 'unavailable';
  for (const child of children) {
    if (!isRecord(child) || STRUCTURAL.some((key) => Object.hasOwn(child, key))) return 'unavailable';
    if (SCALARS.has(child.type)) continue;
    if (child.type === 'array' && isRecord(child.items) && SCALARS.has(child.items.type)
      && !STRUCTURAL.some((key) => Object.hasOwn(child.items, key))) continue;
    return 'unavailable';
  }
  return 'legacy';
}

/** Project only the already-selected normalized schema; never strip constraints. */
export function projectIndexterRequestInputV2(schema) {
  let count = 0;
  const allowed = (value, keys) => Object.keys(value).every((key) => SCHEMA_ANNOTATIONS.has(key) || keys.includes(key));
  function fields(value, nested) {
    if (!isRecord(value) || value.type !== 'object' || value.additionalProperties !== false
      || (value.properties !== undefined && !isRecord(value.properties))
      || !allowed(value, ['type', 'properties', 'required', 'additionalProperties'])) return null;
    const properties = value.properties ?? {};
    const names = Object.keys(properties);
    const required = Object.hasOwn(value, 'required') ? value.required : [];
    if (!Array.isArray(required) || required.some((name) => typeof name !== 'string' || !Object.hasOwn(properties, name))
      || new Set(required).size !== required.length) return null;
    const result = [];
    for (const name of names.sort(compare)) {
      if (!safeName(name) || ++count > 24) return null;
      const child = properties[name];
      if (!isRecord(child)) return null;
      const base = { name, location: 'body', required: required.includes(name) };
      if (SCALARS.has(child.type)) {
        if (!allowed(child, ['type', 'enum'])) return null;
        result.push({ ...base, type: child.type, ...(Object.hasOwn(child, 'enum') ? { enum: child.enum } : {}) });
      } else if (!nested && child.type === 'array') {
        if (!allowed(child, ['type', 'items', 'minItems', 'maxItems'])
          || !isRecord(child.items) || !SCALARS.has(child.items.type) || !allowed(child.items, ['type'])) return null;
        result.push({ ...base, type: 'array', items: { type: child.items.type },
          minItems: Object.hasOwn(child, 'minItems') ? child.minItems : 0, maxItems: Object.hasOwn(child, 'maxItems') ? child.maxItems : 32 });
      } else if (!nested && child.type === 'object') {
        const children = fields(child, true);
        if (!children) return null;
        result.push({ ...base, type: 'object', additionalProperties: false, fields: children });
      } else return null;
    }
    return result;
  }
  const projected = fields(schema, false);
  return projected && parseIndexterRequestInputV2({ version: 2, additionalProperties: false, fields: projected });
}
