import type {
  CallToolResult,
  ToolResultContent,
  UnknownObject,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isToolResultContent(value: unknown): value is ToolResultContent {
  return isRecord(value) && typeof value.type === 'string';
}

function stringifyResult(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Preserve the canonical MCP CallToolResult envelope while keeping the
 * historical `result` string available to older widget consumers.
 */
export function normalizeCallToolResult<
  StructuredContent = unknown,
  Meta = UnknownObject,
>(value: unknown): CallToolResult<StructuredContent, Meta> {
  if (!isRecord(value)) {
    return { result: stringifyResult(value) };
  }

  const content = Array.isArray(value.content)
    ? value.content.filter(isToolResultContent)
    : undefined;
  const structuredContent = value.structuredContent as StructuredContent | undefined;
  const textContent = content?.find(
    (item) => item.type === 'text' && typeof item.text === 'string',
  )?.text;
  const result =
    typeof value.result === 'string'
      ? value.result
      : textContent
        ?? (structuredContent !== undefined
          ? stringifyResult(structuredContent)
          : stringifyResult(value));

  return {
    ...value,
    ...(content ? { content } : {}),
    result,
  } as CallToolResult<StructuredContent, Meta>;
}
