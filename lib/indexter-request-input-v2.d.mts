export type IndexterV2ScalarType = 'boolean' | 'integer' | 'number' | 'string';
export type IndexterV2Scalar = {
  name: string; location: 'body'; required: boolean;
  type: IndexterV2ScalarType; enum?: string[];
};
export type IndexterV2Array = {
  name: string; location: 'body'; required: boolean; type: 'array';
  items: { type: IndexterV2ScalarType }; minItems: number; maxItems: number;
};
export type IndexterV2Object = {
  name: string; location: 'body'; required: boolean; type: 'object';
  additionalProperties: false; fields: IndexterV2Scalar[];
};
export type IndexterRequestInputV2 = {
  version: 2; additionalProperties: false;
  fields: (IndexterV2Scalar | IndexterV2Array | IndexterV2Object)[];
};
export function parseIndexterRequestInputV2(value: unknown): IndexterRequestInputV2 | null;
export const INDEXTER_V2_BODY_GUIDANCE: string;
export function classifyIndexterBodySchema(schema: unknown): 'legacy' | 'nested' | 'unavailable';
export function projectIndexterRequestInputV2(schema: unknown): IndexterRequestInputV2 | null;
