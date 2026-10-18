import assert from 'node:assert/strict';

// JSON Schema assertions inspect the referenced schema too: draft-07 permits
// shared definitions in both input and output schemas.
export function dereferenceSchema(value, root = value) {
  if (Array.isArray(value)) return value.map((item) => dereferenceSchema(item, root));
  if (!value || typeof value !== 'object') return value;
  if (value.$ref) {
    assert.ok(value.$ref.startsWith('#/'), 'expected a local schema reference');
    const target = value.$ref.slice(2).split('/').reduce(
      (schema, key) => schema[key.replace(/~1/g, '/').replace(/~0/g, '~')], root,
    );
    assert.ok(target, `missing schema reference ${value.$ref}`);
    return dereferenceSchema(target, root);
  }
  return Object.fromEntries(Object.entries(value).map(
    ([key, item]) => [key, dereferenceSchema(item, root)],
  ));
}

