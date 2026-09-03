import { j as jsxRuntimeExports } from "./adapter-DvI1aAxR.js";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cleanString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
function parseJsonString(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}
function imageFrom(value) {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  const imageOnlyKeys = /* @__PURE__ */ new Set(["image_url", "imageUrl", "url", "alt", "title"]);
  if (keys.some((key) => !imageOnlyKeys.has(key))) return null;
  const candidate = value.image_url ?? value.imageUrl ?? value.url;
  if (typeof candidate !== "string") return null;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!/\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(parsed.pathname)) return null;
    const alt = cleanString(value.alt) ?? cleanString(value.title) ?? "Returned result";
    return {
      src: `https://api.dexter.cash/api/img?url=${encodeURIComponent(parsed.toString())}`,
      alt
    };
  } catch {
    return null;
  }
}
function returnedResultIsImage(data) {
  const parsed = typeof data === "string" ? parseJsonString(data) : data;
  return imageFrom(parsed) !== null;
}
function displayText(value) {
  const parsed = typeof value === "string" ? parseJsonString(value) : value;
  if (imageFrom(parsed)) return null;
  if (typeof parsed === "string") return parsed;
  if (parsed === null || parsed === void 0) return null;
  if (typeof parsed === "number" || typeof parsed === "boolean") {
    return String(parsed);
  }
  try {
    const serialized = JSON.stringify(parsed, null, 2);
    return typeof serialized === "string" ? serialized : String(parsed);
  } catch {
    return null;
  }
}
function returnedResultNeedsPreview(data, maxCharacters, maxLines) {
  const value = displayText(data);
  if (value === null) return false;
  return Boolean(
    maxCharacters && value.length > maxCharacters || maxLines && value.split("\n").length > maxLines
  );
}
function preview(value, maxCharacters, maxLines) {
  let visible = value;
  let shortened = false;
  if (maxLines) {
    const lines = visible.split("\n");
    if (lines.length > maxLines) {
      visible = lines.slice(0, maxLines).join("\n");
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
    value: `${visible.trimEnd()}
…`,
    shortened: true
  };
}
function ReturnedResult({
  data,
  maxCharacters,
  maxLines,
  maxImageHeight,
  previewMessage = "Showing a preview. Open the full result to see the rest."
}) {
  const parsed = typeof data === "string" ? parseJsonString(data) : data;
  const image = imageFrom(parsed);
  if (image) {
    const imageStyle = maxImageHeight ? { maxHeight: `${maxImageHeight}px` } : void 0;
    return /* @__PURE__ */ jsxRuntimeExports.jsx("figure", { className: "dx-result-payload dx-result-payload--image", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: image.src, alt: image.alt, style: imageStyle }) });
  }
  if (typeof parsed === "string") {
    const text = preview(parsed, maxCharacters, maxLines);
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-result-payload dx-result-payload--text", "aria-label": "Returned result", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: text.value }) }),
      text.shortened ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-result-payload-note", children: previewMessage }) : null
    ] });
  }
  if (parsed === null || parsed === void 0 || Array.isArray(parsed) && parsed.length === 0 || isRecord(parsed) && Object.keys(parsed).length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-result-payload dx-result-payload--empty", children: "The provider returned an empty result." });
  }
  if (typeof parsed === "number" || typeof parsed === "boolean") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-result-payload dx-result-payload--value", "aria-label": "Returned result", children: String(parsed) });
  }
  let serialized;
  try {
    const encoded = JSON.stringify(parsed, null, 2);
    serialized = typeof encoded === "string" ? encoded : String(parsed);
  } catch {
    serialized = String(parsed);
  }
  const json = preview(serialized, maxCharacters, maxLines);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "dx-result-payload dx-result-payload--json", "aria-label": "Returned result", children: /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: json.value }) }),
    json.shortened ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-result-payload-note", children: previewMessage }) : null
  ] });
}
export {
  ReturnedResult as R,
  returnedResultNeedsPreview as a,
  returnedResultIsImage as r
};
