/**
 * resolve.ts — the ONE place schema-source precedence is decided.
 *
 * Precedence: declaration (bazaar) > derived (openapi) > guess (service_profile).
 * Every DB-backed consumer should call these instead of rolling its own
 * `bazaar ?? openapi ?? profile` chain, so a future source = one edit here.
 *
 * KEY: an EMPTY bazaar block (object with no usable properties) is treated as
 * ABSENT — we never downgrade a rich profile/openapi to an empty declaration.
 */

import { isObject } from './bazaar.js';

export type InputSchemaSource = 'bazaar' | 'openapi' | 'profile' | 'none';
export type OutputSchemaSource = 'bazaar' | 'openapi' | 'none';

export interface ResolveInputArgs {
  bazaar_input_schema?: unknown;
  openapi_input_schema?: unknown;
  service_profile?: unknown;
}

export interface ResolveOutputArgs {
  bazaar_output_schema?: unknown;
  openapi_output_schema?: unknown;
}

/** True for a non-null, non-array object that has at least one own key. */
function isNonEmptyObject(v: unknown): v is Record<string, unknown> {
  return isObject(v) && Object.keys(v).length > 0;
}

/**
 * A bazaar schema "says something" only if it has a `properties` object with at
 * least one field. We treat `{}`, `{type:'object'}` (no properties key),
 * `{...,properties:{}}`, `{...,properties:null}`, and `{...,properties:[]}` ALL
 * as absent — never downgrade a rich openapi/profile to a contentless declaration.
 */
function bazaarHasContent(v: unknown): boolean {
  if (!isObject(v)) return false;
  return isNonEmptyObject((v as Record<string, unknown>).properties);
}

/** True when a service_profile carries any declared input semantics. */
function profileHasInput(profile: unknown): boolean {
  if (profile == null || typeof profile !== 'object') return false;
  const sem = (profile as Record<string, unknown>).input_semantics;
  return Array.isArray(sem) && sem.length > 0;
}

export function resolveInputSchema(r: ResolveInputArgs): { schema: unknown; source: InputSchemaSource } {
  if (bazaarHasContent(r.bazaar_input_schema)) {
    return { schema: r.bazaar_input_schema, source: 'bazaar' };
  }
  if (isNonEmptyObject(r.openapi_input_schema)) {
    return { schema: r.openapi_input_schema, source: 'openapi' };
  }
  if (profileHasInput(r.service_profile)) {
    return { schema: r.service_profile, source: 'profile' };
  }
  return { schema: null, source: 'none' };
}

export function resolveOutputSchema(r: ResolveOutputArgs): { schema: unknown; source: OutputSchemaSource } {
  if (bazaarHasContent(r.bazaar_output_schema)) {
    return { schema: r.bazaar_output_schema, source: 'bazaar' };
  }
  if (isNonEmptyObject(r.openapi_output_schema)) {
    return { schema: r.openapi_output_schema, source: 'openapi' };
  }
  return { schema: null, source: 'none' };
}
