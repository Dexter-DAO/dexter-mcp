type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseJsonString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function imageFrom(value: unknown): { src: string; alt: string } | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  const imageOnlyKeys = new Set(['image_url', 'imageUrl', 'url', 'alt', 'title']);
  if (keys.some((key) => !imageOnlyKeys.has(key))) return null;
  const candidate = value.image_url ?? value.imageUrl ?? value.url;
  if (typeof candidate !== 'string') return null;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!/\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(parsed.pathname)) return null;
    const alt = cleanString(value.alt) ?? cleanString(value.title) ?? 'Returned result';
    return {
      src: `https://api.dexter.cash/api/img?url=${encodeURIComponent(parsed.toString())}`,
      alt,
    };
  } catch {
    return null;
  }
}

export function returnedResultIsImage(data: unknown): boolean {
  const parsed = typeof data === 'string' ? parseJsonString(data) : data;
  return imageFrom(parsed) !== null;
}

function displayText(value: unknown): string | null {
  const parsed = typeof value === 'string' ? parseJsonString(value) : value;
  if (imageFrom(parsed)) return null;
  if (typeof parsed === 'string') return parsed;
  if (parsed === null || parsed === undefined) return null;
  if (typeof parsed === 'number' || typeof parsed === 'boolean') {
    return String(parsed);
  }
  try {
    const serialized = JSON.stringify(parsed, null, 2);
    return typeof serialized === 'string' ? serialized : String(parsed);
  } catch {
    return null;
  }
}

export function returnedResultLength(data: unknown): number {
  return displayText(data)?.length ?? 0;
}

export function returnedResultNeedsPreview(
  data: unknown,
  maxCharacters: number | null | undefined,
  maxLines: number | null | undefined,
): boolean {
  const value = displayText(data);
  if (value === null) return false;
  return Boolean(
    (maxCharacters && value.length > maxCharacters)
    || (maxLines && value.split('\n').length > maxLines),
  );
}

function preview(
  value: string,
  maxCharacters: number | null | undefined,
  maxLines: number | null | undefined,
) {
  let visible = value;
  let shortened = false;
  if (maxLines) {
    const lines = visible.split('\n');
    if (lines.length > maxLines) {
      visible = lines.slice(0, maxLines).join('\n');
      shortened = true;
    }
  }
  if (maxCharacters && visible.length > maxCharacters) {
    visible = visible.slice(0, maxCharacters);
    shortened = true;
  }
  if (!shortened) {
    return { value, shortened: false };
  }
  return {
    value: `${visible.trimEnd()}\n…`,
    shortened: true,
  };
}

export function ReturnedResult({
  data,
  maxCharacters,
  maxLines,
  maxImageHeight,
  previewMessage = 'Showing a preview. Open the full result to see the rest.',
}: {
  data: unknown;
  maxCharacters?: number | null;
  maxLines?: number | null;
  maxImageHeight?: number | null;
  previewMessage?: string;
}) {
  const parsed = typeof data === 'string' ? parseJsonString(data) : data;
  const image = imageFrom(parsed);

  if (image) {
    const imageStyle = maxImageHeight
      ? { maxHeight: `${maxImageHeight}px` }
      : undefined;
    return (
      <figure className="dx-result-payload dx-result-payload--image">
        <img src={image.src} alt={image.alt} style={imageStyle} />
      </figure>
    );
  }

  if (typeof parsed === 'string') {
    const text = preview(parsed, maxCharacters, maxLines);
    return (
      <>
        <div className="dx-result-payload dx-result-payload--text" aria-label="Returned result">
          <p>{text.value}</p>
        </div>
        {text.shortened ? (
          <p className="dx-result-payload-note">{previewMessage}</p>
        ) : null}
      </>
    );
  }

  if (
    parsed === null
    || parsed === undefined
    || (Array.isArray(parsed) && parsed.length === 0)
    || (isRecord(parsed) && Object.keys(parsed).length === 0)
  ) {
    return (
      <p className="dx-result-payload dx-result-payload--empty">
        The provider returned an empty result.
      </p>
    );
  }

  if (typeof parsed === 'number' || typeof parsed === 'boolean') {
    return (
      <p className="dx-result-payload dx-result-payload--value" aria-label="Returned result">
        {String(parsed)}
      </p>
    );
  }

  let serialized: string;
  try {
    const encoded = JSON.stringify(parsed, null, 2);
    serialized = typeof encoded === 'string' ? encoded : String(parsed);
  } catch {
    serialized = String(parsed);
  }
  const json = preview(serialized, maxCharacters, maxLines);

  return (
    <>
      <pre className="dx-result-payload dx-result-payload--json" aria-label="Returned result">
        <code>{json.value}</code>
      </pre>
      {json.shortened ? (
        <p className="dx-result-payload-note">{previewMessage}</p>
      ) : null}
    </>
  );
}
