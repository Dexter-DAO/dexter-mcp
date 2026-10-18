import { z } from 'zod';

function fieldDefToZodType(fieldDef = {}) {
  const base = fieldDef || {};
  let zodType;

  if (Array.isArray(base.enum) && base.enum.length > 0) {
    const entries = [...new Set(base.enum.map((value) => String(value)))]
      .filter(Boolean);
    if (entries.length === 1) {
      zodType = z.literal(entries[0]);
    } else if (entries.length > 1) {
      zodType = z.enum(entries);
    }
  }

  if (!zodType) {
    switch (base.type) {
      case 'number':
      case 'integer':
        zodType = z.number();
        break;
      case 'boolean':
        zodType = z.boolean();
        break;
      case 'object':
        if (base.properties && typeof base.properties === 'object') {
          const shape = {};
          for (const [key, child] of Object.entries(base.properties)) {
            shape[key] = fieldDefToZodType(child);
          }
          zodType = z.object(shape).meta({ additionalProperties: false });
        } else {
          zodType = z.record(z.string(), z.unknown());
        }
        break;
      case 'array':
        if (base.items) {
          zodType = z.array(fieldDefToZodType(base.items));
        } else {
          zodType = z.array(z.unknown());
        }
        break;
      case 'null':
        zodType = z.null();
        break;
      default:
        zodType = z.string();
        break;
    }
  }

  if (base.description) {
    try {
      zodType = zodType.describe(String(base.description));
    } catch {}
  }

  const required = base.required;
  const isRequired = required === true || (Array.isArray(required) && required.length > 0);
  if (!isRequired) {
    zodType = zodType.optional();
  }

  return zodType;
}

export function buildInputSchemaShape(inputSchema = {}, method = 'GET') {
  const upperMethod = String(method || 'GET').toUpperCase();
  const fields = {};

  if (upperMethod === 'GET' || upperMethod === 'HEAD' || upperMethod === 'OPTIONS') {
    const queryParams = inputSchema.queryParams || inputSchema.query_params;
    if (queryParams && typeof queryParams === 'object') {
      for (const [key, def] of Object.entries(queryParams)) {
        fields[key] = fieldDefToZodType(def);
      }
    }
  } else {
    const bodyFields = inputSchema.bodyFields || inputSchema.body_fields || inputSchema.body;
    if (bodyFields && typeof bodyFields === 'object') {
      for (const [key, def] of Object.entries(bodyFields)) {
        fields[key] = fieldDefToZodType(def);
      }
    }
  }

  return fields;
}
