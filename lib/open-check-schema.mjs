function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, key) {
  return isPlainObject(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function persistedSchemaCandidate(enrichment) {
  const resource = isPlainObject(enrichment?.resource) ? enrichment.resource : null;
  if (!resource || !hasOwn(resource, 'input_schema')) return null;

  const schemaSource = typeof resource.input_schema_source === 'string'
    ? resource.input_schema_source.trim()
    : '';
  // Only a normalized OpenAPI/catalog contract may repair the exact calling
  // schema. A service profile is LLM-derived behavioral context, not an
  // authoritative request shape, and a cached Bazaar copy must not overrule
  // the seller's fresher live Bazaar declaration.
  if (schemaSource.toLowerCase() !== 'openapi') return null;
  const rejectedSources = Array.isArray(resource.input_schema_rejected_sources)
    ? resource.input_schema_rejected_sources.filter(
        (source) => typeof source === 'string' && source.length > 0,
      )
    : [];

  return {
    schema: resource.input_schema,
    schemaSource,
    rejectedSources,
  };
}

function schemaHasConcreteInputs(schema) {
  if (!isPlainObject(schema)) return false;

  if (Array.isArray(schema.input_semantics) && schema.input_semantics.length > 0) {
    return true;
  }
  if (typeof schema.$ref === 'string' && schema.$ref.trim() !== '') return true;
  if (isPlainObject(schema.properties)) {
    if (Object.keys(schema.properties).length > 0) return true;
    if (schema.additionalProperties === true) return true;
    return isPlainObject(schema.additionalProperties);
  }
  if (schema.additionalProperties === true || isPlainObject(schema.additionalProperties)) {
    return true;
  }
  for (const keyword of ['oneOf', 'anyOf', 'allOf']) {
    if (
      Array.isArray(schema[keyword])
      && schema[keyword].some(schemaHasConcreteInputs)
    ) {
      return true;
    }
  }
  if (schema.type === 'array') return schemaHasConcreteInputs(schema.items);
  return typeof schema.type === 'string' && schema.type !== 'object';
}

function isClosedEmptyObjectSchema(schema) {
  return (
    isPlainObject(schema)
    && (schema.type === 'object' || isPlainObject(schema.properties))
    && (!hasOwn(schema, 'properties')
      || (isPlainObject(schema.properties) && Object.keys(schema.properties).length === 0))
    && schema.additionalProperties === false
  );
}

function fixedOperationSuffix(resourceUrl) {
  if (typeof resourceUrl !== 'string' || resourceUrl.length === 0) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(resourceUrl).pathname);
  } catch {
    return null;
  }
  const lastSegment = pathname.split('/').filter(Boolean).at(-1) ?? '';
  const match = lastSegment.match(/^.+:([A-Za-z_][\w-]*)$/);
  return match?.[1] ?? null;
}

function isFixedOperationSoleField(schema, resourceUrl) {
  if (!isPlainObject(schema) || !isPlainObject(schema.properties)) return false;
  const operation = fixedOperationSuffix(resourceUrl);
  if (!operation) return false;
  const fields = Object.keys(schema.properties);
  return fields.length === 1 && fields[0] === operation;
}

/**
 * Select the input schema exposed by hosted x402_check without replacing live
 * pricing, authentication, intent, or request evidence.
 *
 * A normalized catalog schema may repair a missing or closed-empty live schema.
 * It may also repair the narrow fixed-operation parser failure where a literal
 * RPC suffix (`model:execute`) appears as the sole request field, but only when
 * a concrete persisted schema with explicit provenance corroborates the repair.
 * Otherwise the live seller declaration remains authoritative and unchanged.
 */
export function reconcileHostedCheckInputSchema({
  liveSchema,
  enrichment,
  resourceUrl,
}) {
  const persisted = persistedSchemaCandidate(enrichment);
  if (!persisted || !schemaHasConcreteInputs(persisted.schema)) {
    return {
      schema: liveSchema,
      source: 'live',
      replaced: false,
      rejectedSources: [],
    };
  }

  const liveMissing = liveSchema === null || liveSchema === undefined;
  const liveClosedEmpty = isClosedEmptyObjectSchema(liveSchema);
  const fixedOperationPhantom = isFixedOperationSoleField(liveSchema, resourceUrl);
  const persistedRepeatsPhantom = isFixedOperationSoleField(
    persisted.schema,
    resourceUrl,
  );
  const persistedRejectedLiveBazaar = persisted.rejectedSources.some(
    (source) => source.toLowerCase() === 'bazaar',
  );

  if (
    liveMissing
    || liveClosedEmpty
    || (
      fixedOperationPhantom
      && !persistedRepeatsPhantom
      && persisted.schemaSource.toLowerCase() !== 'bazaar'
      && persistedRejectedLiveBazaar
    )
  ) {
    return {
      schema: persisted.schema,
      source: persisted.schemaSource,
      replaced: true,
      rejectedSources: persisted.rejectedSources,
    };
  }

  return {
    schema: liveSchema,
    source: 'live',
    replaced: false,
    rejectedSources: [],
  };
}
