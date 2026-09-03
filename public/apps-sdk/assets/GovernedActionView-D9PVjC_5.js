import { j as jsxRuntimeExports, u as useToolOutput, c as useToolResponseMetadata, a as useAdaptiveTheme, b as useAdaptiveMaxHeight, d as useAdaptiveOpenExternal, r as reactExports } from "./adapter-BD2Wya3l.js";
import { u as useOpenAIGlobal } from "./use-openai-global-BfYd9Rwa.js";
function useToolInput() {
  return useOpenAIGlobal("toolInput");
}
function WidgetShell({
  children,
  style,
  density = "comfortable",
  width = "auto"
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "dx-widget",
      "data-density": density,
      "data-width": width,
      style,
      children
    }
  );
}
function WidgetEmpty({
  title,
  description,
  action
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-widget__state", "data-state": "empty", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-widget__state-text", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-widget__state-label", children: title }),
      description ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-widget__state-description", children: description }) : null
    ] }),
    action ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-widget__state-action", children: action }) : null
  ] });
}
function WidgetError({
  title = "Something went wrong",
  description,
  action
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-widget__state", "data-state": "error", role: "alert", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-widget__state-text", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-widget__state-label", children: title }),
      description ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-widget__state-description", children: description }) : null
    ] }),
    action ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "dx-widget__state-action", children: action }) : null
  ] });
}
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
const hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
class Hash {
}
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
class HashMD extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
}
const SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
const SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
class SHA256 extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
}
const sha256$1 = /* @__PURE__ */ createHasher(() => new SHA256());
const sha256 = sha256$1;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map(
  [...BASE58_ALPHABET].map((character, index) => [character, index])
);
const INTEGER = /^(0|[1-9][0-9]*)$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function integerString(value) {
  const candidate = stringValue(value);
  return candidate && INTEGER.test(candidate) ? candidate : null;
}
function decimalString(value) {
  const candidate = stringValue(value);
  return candidate && DECIMAL.test(candidate) ? candidate : null;
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function booleanValue(value) {
  return typeof value === "boolean" ? value : null;
}
function firstRecord(...values) {
  for (const value of values) {
    const candidate = record(value);
    if (candidate) return candidate;
  }
  return null;
}
function firstString(...values) {
  for (const value of values) {
    const candidate = stringValue(value);
    if (candidate) return candidate;
  }
  return null;
}
function firstDecimal(...values) {
  for (const value of values) {
    const candidate = decimalString(value);
    if (candidate) return candidate;
  }
  return null;
}
function firstInteger(...values) {
  for (const value of values) {
    const candidate = integerString(value);
    if (candidate) return candidate;
  }
  return null;
}
function firstBoolean(...values) {
  for (const value of values) {
    const candidate = booleanValue(value);
    if (candidate !== null) return candidate;
  }
  return null;
}
function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter((item) => item !== null);
}
function operationOf(root, input) {
  const explicit = firstString(root.operation)?.toLowerCase();
  if (explicit === "prepare" || explicit === "execute" || explicit === "status" || explicit === "reconcile") return explicit;
  const namespace = firstString(root.namespace);
  if (namespace === "dexter-governed-agent-action/v1") return "prepare";
  if (namespace === "dexter-governed-agent-execute/v1") return "execute";
  if (namespace === "dexter-governed-transaction-status/v1") return "status";
  if (namespace === "dexter-governed-agent-reconcile/v1") return "reconcile";
  if (input?.operationId !== void 0 && input?.intentId !== void 0) return "execute";
  if (input?.action !== void 0) return "prepare";
  return "unknown";
}
function actorOf(...values) {
  const actor = firstString(...values)?.toLowerCase();
  return actor === "agent" || actor === "owner" ? actor : "unknown";
}
function ownerDecisionOf(...values) {
  const status = firstString(...values)?.toLowerCase();
  return status === "not-required" || status === "pending" || status === "approved" || status === "refused" ? status : null;
}
function policyDecisionOf(...values) {
  const decision = firstString(...values)?.toLowerCase();
  return decision === "allowed" || decision === "approval_required" ? decision : null;
}
function groupedInteger(value) {
  if (!value || !INTEGER.test(value)) return null;
  return BigInt(value).toLocaleString("en-US");
}
function decodedBase58ByteLength(value) {
  if (!value) return null;
  const bytes = [0];
  for (const character of value) {
    const digit = BASE58_INDEX.get(character);
    if (digit === void 0) return null;
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  let leadingZeroBytes = 0;
  while (leadingZeroBytes < value.length && value[leadingZeroBytes] === "1") {
    leadingZeroBytes += 1;
  }
  const magnitudeBytes = bytes.length === 1 && bytes[0] === 0 ? 0 : bytes.length;
  return leadingZeroBytes + magnitudeBytes;
}
function safeNumber(value) {
  const direct = numberValue(value);
  if (direct !== null) return direct;
  const candidate = stringValue(value);
  if (!candidate) return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}
function safeInteger(value, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = safeNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}
function normalizeProduct(identity, preview, business, status) {
  return {
    assetId: firstString(
      identity?.assetId,
      preview?.assetId,
      business?.assetId,
      status.assetId
    ),
    assetClass: firstString(identity?.assetClass),
    companyName: firstString(identity?.companyName),
    productName: firstString(identity?.productName),
    symbol: firstString(identity?.symbol, preview?.symbol),
    providerName: firstString(identity?.providerName),
    legalIssuerName: firstString(identity?.legalIssuerName),
    issuer: firstString(identity?.issuer),
    network: firstString(identity?.network, "solana-mainnet"),
    mint: firstString(
      identity?.mint,
      status.assetMint,
      preview?.outputMint
    ),
    tokenProgram: firstString(identity?.tokenProgram, status.tokenProgram),
    decimals: safeInteger(identity?.decimals, 0, 18),
    registryIdentityDigest: firstString(identity?.registryIdentityDigest)
  };
}
function feeLine(value) {
  const candidate = record(value);
  if (!candidate) return null;
  const amountAtomic = integerString(candidate.amountAtomic);
  const mint = stringValue(candidate.mint);
  return amountAtomic && mint ? { amountAtomic, mint } : null;
}
function normalizeFees(value) {
  if (!value) return null;
  const summary = stringValue(value.summary);
  const networkFee = record(value.networkFee);
  if (!summary || !networkFee) return null;
  const routeFees = Array.isArray(value.routeFees) ? value.routeFees.map(feeLine).filter((item) => item !== null) : [];
  return {
    summary,
    platformFee: feeLine(value.platformFee),
    routeFees,
    networkFeeStatus: stringValue(networkFee.status),
    networkFeeLamports: integerString(networkFee.amountLamports)
  };
}
function formatAtomicDecimal(value, decimals, maximumFractionDigits = decimals) {
  if (!value || !INTEGER.test(value) || !Number.isInteger(decimals) || decimals < 0) {
    return null;
  }
  const padded = value.padStart(decimals + 1, "0");
  const integer = decimals === 0 ? padded : padded.slice(0, -decimals);
  const rawFraction = decimals === 0 ? "" : padded.slice(-decimals);
  const fraction = rawFraction.slice(0, Math.max(0, maximumFractionDigits)).replace(/0+$/, "");
  const grouped = BigInt(integer).toLocaleString("en-US");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
function displayQuantity(value) {
  if (!value) return null;
  const [integer, fraction = ""] = value.split(".");
  const grouped = BigInt(integer).toLocaleString("en-US");
  const trimmed = fraction.slice(0, 8).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}
function actionOf(...values) {
  const action = firstString(...values)?.toLowerCase();
  return action === "buy" || action === "sell" || action === "send" ? action : "unknown";
}
function commitmentOf(...values) {
  const commitment = firstString(...values)?.toLowerCase();
  return commitment === "confirmed" || commitment === "finalized" ? commitment : null;
}
function exactSignature(...values) {
  const signature = firstString(...values);
  return signature && decodedBase58ByteLength(signature) === 64 ? signature : null;
}
function exactStringAgreement(...values) {
  const present = values.filter((value) => typeof value === "string" && value.length > 0);
  return present.length > 0 && present.every((value) => value === present[0]);
}
function exactNumberAgreement(...values) {
  const present = values.filter((value) => typeof value === "number" && Number.isSafeInteger(value));
  return present.length > 0 && present.every((value) => value === present[0]);
}
function exactGovernedAssetIdentity(product) {
  return firstString(product.assetClass) === "stock" && firstString(product.companyName) !== null && firstString(product.productName) !== null && firstString(product.providerName) !== null && firstString(product.legalIssuerName) !== null && exactStringAgreement(product.issuer, product.legalIssuerName) && firstString(product.registryIdentityDigest) !== null && safeInteger(product.decimals, 0, 18) !== null && exactNumberAgreement(product.decimals);
}
function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("non_integer_identity_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("unsupported_governed_identity_value");
  }
  const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, item]) => {
    if (item === void 0) {
      throw new TypeError(`undefined_governed_identity_value:${key}`);
    }
    return `${JSON.stringify(key)}:${canonicalJson(item)}`;
  }).join(",")}}`;
}
function stockTradeSummarySnapshotDigest(summary) {
  const product = record(summary.productIdentity);
  if (product === null || summary.namespace !== "dexter-governed-stock-trade-summary/v1") return null;
  try {
    const snapshot = {
      namespace: "dexter-governed-stock-prepare-summary-snapshot/v1",
      action: summary.action,
      assetId: summary.assetId,
      symbol: summary.symbol,
      amountAtomic: summary.amountAtomic,
      requestAmountKind: summary.requestAmountKind,
      requestedShareQuantity: summary.requestedShareQuantity,
      shareQuantityUnit: summary.shareQuantityUnit,
      shareQuantitySemantics: summary.shareQuantitySemantics,
      requestedMaximumSpendAtomic: summary.requestedMaximumSpendAtomic,
      overfillPossible: summary.overfillPossible,
      productIdentity: {
        assetId: product.assetId,
        assetClass: product.assetClass,
        companyName: product.companyName,
        productName: product.productName,
        symbol: product.symbol,
        providerName: product.providerName,
        legalIssuerName: product.legalIssuerName,
        issuer: product.issuer,
        mint: product.mint,
        tokenProgram: product.tokenProgram,
        decimals: product.decimals,
        network: product.network,
        registryIdentityDigest: product.registryIdentityDigest
      }
    };
    return bytesToHex(sha256(utf8ToBytes(canonicalJson(snapshot))));
  } catch {
    return null;
  }
}
function exactSuccessEnvelopeIdentity(input) {
  const selection = record(input.status.stockSelection);
  const durableIdentity = record(input.status.stockV2Identity);
  const product = record(input.tradeSummary?.productIdentity);
  const intentId = firstString(input.status.intentId, input.root.intentId);
  const durableSummaryDigest = firstString(
    durableIdentity?.tradeSummarySnapshotDigest
  );
  if (intentId === null || !exactStringAgreement(
    input.status.intentId,
    input.root.intentId,
    durableIdentity?.intentId
  )) return false;
  if (durableIdentity !== null && (selection === null || input.tradeSummary === null || firstString(durableIdentity.intentId) !== intentId || durableIdentity.namespace !== "dexter-governed-stock-v2-durable-identity/v1" || durableSummaryDigest === null || !SHA256_HEX.test(durableSummaryDigest) || stockTradeSummarySnapshotDigest(input.tradeSummary) !== durableSummaryDigest)) return false;
  if (selection !== null && durableIdentity === null) return false;
  if (input.tradeSummary === null) {
    return exactStringAgreement(input.status.action, input.business?.action) && exactStringAgreement(input.status.assetId, input.business?.assetId) && exactStringAgreement(
      input.status.amountAtomic,
      input.business?.amountAtomic
    );
  }
  if (product === null || !exactGovernedAssetIdentity(product)) return false;
  return exactStringAgreement(
    input.tradeSummary.action,
    input.status.action,
    input.business?.action
  ) && exactStringAgreement(
    input.tradeSummary.assetId,
    product.assetId,
    selection?.assetId,
    input.status.assetId,
    input.business?.assetId
  ) && exactStringAgreement(
    input.tradeSummary.amountAtomic,
    input.status.amountAtomic,
    input.business?.amountAtomic
  ) && exactStringAgreement(
    product.mint,
    selection?.mint,
    input.status.assetMint
  ) && exactStringAgreement(
    product.tokenProgram,
    selection?.tokenProgram,
    input.status.tokenProgram
  ) && (selection === null || exactStringAgreement(
    input.tradeSummary.symbol,
    product.symbol,
    selection.productSymbol
  ) && exactStringAgreement(product.companyName, selection.companyName) && exactStringAgreement(product.productName, selection.productName) && exactStringAgreement(product.providerName, selection.providerName) && exactStringAgreement(
    product.legalIssuerName,
    product.issuer,
    selection.legalIssuerName
  ) && exactStringAgreement(
    product.registryIdentityDigest,
    selection.registryIdentityDigest
  ) && exactNumberAgreement(product.decimals, selection.decimals));
}
function productLabel(product) {
  return firstString(
    product.companyName,
    product.productName,
    product.symbol,
    product.assetId
  ) ?? "asset";
}
function sharePhrase(quantity) {
  const displayed = displayQuantity(quantity);
  if (!displayed) return "the requested amount";
  return `${displayed} ${displayed === "1" ? "share" : "shares"}`;
}
function classifyStage(input) {
  if (input.signature !== null && input.commitment !== null && input.executionSucceeded === true && input.identityExact) {
    return "success";
  }
  if (input.executionSucceeded === false || input.programError || input.definitiveNonlandingProof || ["failed", "refused", "provably_not_landed"].includes(input.rawStatus)) {
    return "failure";
  }
  if (input.rawStatus === "prepared") return "prepared";
  return "pending";
}
function actionPhrase(input) {
  const product = productLabel(input.product);
  const shareTarget = displayQuantity(input.requestedShares ?? input.minimumShares);
  const amount = input.amountDisplay && input.amountUnit ? `${input.amountDisplay} ${input.amountUnit}` : input.amountDisplay;
  const amountAlreadyNamesAsset = input.amountUnit?.endsWith(" base units") === true;
  const destination = shortenSolanaIdentity(input.destinationOwner, 5);
  if (input.action === "buy") {
    const target = shareTarget ? `${sharePhrase(input.requestedShares ?? input.minimumShares)} of ${product}` : input.quotedSpend ? `$${input.quotedSpend} of ${product}` : product;
    return {
      imperative: `Buy ${target}`,
      completed: `${target} bought`,
      noun: "purchase"
    };
  }
  if (input.action === "sell") {
    const target = amount ? amountAlreadyNamesAsset ? amount : `${amount} of ${product}` : product;
    return {
      imperative: `Sell ${target}`,
      completed: `${target} sold`,
      noun: "sale"
    };
  }
  if (input.action === "send") {
    const target = amount ?? product;
    const suffix = destination ? ` to ${destination}` : "";
    return {
      imperative: `Send ${target}${suffix}`,
      completed: `${target} sent${suffix}`,
      noun: "transfer"
    };
  }
  return {
    imperative: "Governed action",
    completed: "Governed action confirmed",
    noun: "action"
  };
}
function stageCopy(input) {
  const phrase = actionPhrase(input);
  if (input.stage === "success") {
    return {
      stageLabel: input.commitment === "finalized" ? "Finalized" : "Confirmed",
      headline: phrase.completed,
      supporting: "Solana confirmed the transaction and Dexter recorded successful execution."
    };
  }
  if (input.stage === "failure") {
    return {
      stageLabel: input.rawStatus === "refused" ? "Stopped" : "Failed",
      headline: `${phrase.imperative} stopped before completion`,
      supporting: input.definitiveNonlandingProof ? "Dexter proved that this transaction did not land." : "Dexter recorded no successful execution for this action."
    };
  }
  if (input.stage === "prepared") {
    return {
      stageLabel: "Prepared",
      headline: phrase.imperative,
      supporting: "This exact action is prepared. Nothing has been signed or submitted."
    };
  }
  if (input.commitment !== null && input.executionSucceeded !== true) {
    return {
      stageLabel: "Verifying",
      headline: `${phrase.imperative} is being verified`,
      supporting: "Solana confirmation is present. Dexter has not yet proven successful execution."
    };
  }
  if (["uncertain", "ambiguous", "reconciliation-required", "unknown"].includes(input.rawStatus)) {
    return {
      stageLabel: "Outcome unknown",
      headline: `Outcome unknown for ${phrase.noun}`,
      supporting: input.operation === "prepare" ? "Retry only the same request with the same operation ID." : "Keep this intent and inspect its durable status before any further action."
    };
  }
  if (input.rawStatus === "signed") {
    return {
      stageLabel: "Signed",
      headline: `${phrase.imperative} is signed`,
      supporting: "The signed transaction has not been proven submitted or confirmed."
    };
  }
  return {
    stageLabel: "Pending",
    headline: `${phrase.imperative} is awaiting confirmation`,
    supporting: "Keep this intent and read its durable status before taking another action."
  };
}
function recoveryFor(input) {
  if (input.stage === "success" || input.definitiveNonlandingProof) {
    return { kind: "none", sentence: null };
  }
  if (input.retry === "same_operation_only" || input.retryable === true || input.operation === "prepare" && ["uncertain", "unknown"].includes(input.rawStatus)) {
    return {
      kind: "same-request",
      sentence: "Retry only the same request with the same operation ID."
    };
  }
  if (input.retry === "reconcile_same_intent_only") {
    return {
      kind: "reconcile",
      sentence: "Do not execute again. Inspect and reconcile this same intent only."
    };
  }
  if (input.retry === "manual_same_intent_only") {
    return {
      kind: "manual",
      sentence: "Do not retry automatically. Inspect this same intent before any manual reconciliation."
    };
  }
  if (input.operation === "reconcile" && ["pending", "unavailable"].includes(input.reconcileOutcome ?? "")) {
    return {
      kind: "manual",
      sentence: "Do not retry reconciliation automatically. Inspect this same intent first."
    };
  }
  if (input.intentId && (input.rawStatus === "reconciliation-required" || input.rawStatus === "ambiguous" || input.reconciliationRequired && input.canReconcile)) {
    return {
      kind: "reconcile",
      sentence: "Do not execute again. Reconcile this same intent and attempt only."
    };
  }
  if (input.retry === "read_again" || input.intentId && input.stage === "pending") {
    return {
      kind: "read",
      sentence: "Do not execute again. Read this same intent before taking another action."
    };
  }
  return { kind: "none", sentence: null };
}
function normalizeGovernedAction(payload, toolInput = null) {
  const root = record(payload);
  if (!root) return null;
  const input = record(toolInput);
  const namespace = firstString(root.namespace);
  if (namespace === "dexter-governed-transaction-history/v1") return null;
  const operation = operationOf(root, input);
  const statusAfter = record(root.statusAfter);
  const status = statusAfter ?? root;
  const preview = firstRecord(root.preview, status.preview);
  const business = firstRecord(status.business, root.business);
  const tradeSummary = firstRecord(status.tradeSummary, root.tradeSummary);
  const attribution = firstRecord(status.attribution, root.attribution);
  const grant = firstRecord(attribution?.grant);
  const approval = firstRecord(status.approval, root.approval);
  const ownerDecisionRecord = firstRecord(status.ownerDecision, root.ownerDecision);
  const replay = firstRecord(status.replay, root.replay);
  const execution = firstRecord(status.execution, root.execution);
  const share = firstRecord(
    preview?.shareQuantity,
    status.shareQuantity,
    business?.shareQuantity,
    root.shareQuantity
  );
  const productIdentity = firstRecord(
    tradeSummary?.productIdentity,
    preview?.productIdentity,
    status.productIdentity,
    business?.productIdentity,
    root.productIdentity
  );
  const feeSummary = firstRecord(
    tradeSummary?.feeSummary,
    preview?.feeSummary,
    status.feeSummary,
    business?.feeSummary,
    root.feeSummary
  );
  const action = actionOf(
    tradeSummary?.action,
    preview?.action,
    status.action,
    business?.action,
    root.action,
    input?.action
  );
  const product = normalizeProduct(productIdentity, preview, business, status);
  const destinationOwner = firstString(
    preview?.destinationOwner,
    status.destinationOwner,
    business?.destinationOwner,
    root.destinationOwner,
    input?.destinationOwner
  );
  const requestedShares = firstDecimal(
    tradeSummary?.requestedShareQuantity,
    preview?.requestedShareQuantity,
    share?.requestedShareQuantity,
    status.requestedShareQuantity,
    root.requestedShareQuantity,
    input?.shareQuantity
  );
  const expectedShares = firstDecimal(
    tradeSummary?.expectedShareQuantity,
    preview?.expectedShareQuantity,
    share?.expectedShareQuantity,
    status.expectedShareQuantity,
    root.expectedShareQuantity
  );
  const minimumShares = firstDecimal(
    tradeSummary?.minimumShareQuantity,
    preview?.minimumShareQuantity,
    share?.minimumShareQuantity,
    status.minimumShareQuantity,
    root.minimumShareQuantity
  );
  const requestAmountKind = firstString(
    tradeSummary?.requestAmountKind,
    preview?.requestAmountKind
  ) === "share-quantity" || requestedShares !== null ? "share-quantity" : "input";
  const rawStatus = (firstString(status.status, business?.lifecycle, root.status, root.outcome) ?? (preview ? "prepared" : "unknown")).toLowerCase();
  const signature = exactSignature(
    status.transactionSignature,
    business?.transactionSignature,
    root.transactionSignature
  );
  const commitment = commitmentOf(
    status.confirmationCommitment,
    business?.finality,
    status.finality,
    root.confirmationCommitment
  );
  const executionSucceeded = firstBoolean(
    status.executionSucceeded,
    business?.executionSucceeded,
    root.executionSucceeded
  );
  const programError = firstBoolean(status.programError, business?.programError) === true;
  const definitiveNonlandingProof = firstBoolean(
    status.definitiveNonlandingProof,
    business?.definitiveNonlandingProof
  ) === true;
  const identityExact = exactSuccessEnvelopeIdentity({
    root,
    status,
    business,
    tradeSummary
  });
  const classifiedStage = classifyStage({
    rawStatus,
    signature,
    commitment,
    executionSucceeded,
    programError,
    definitiveNonlandingProof,
    identityExact
  });
  const localFailure = namespace === "opendexter-governed-backend-failure/v1";
  const stage = localFailure ? operation === "execute" || operation === "reconcile" ? "pending" : "failure" : classifiedStage;
  const quotedInputAtomic = firstInteger(
    tradeSummary?.amountAtomic,
    preview?.maximumInputAmountAtomic,
    preview?.amountAtomic,
    business?.amountAtomic,
    status.amountAtomic
  );
  const expectedOutputAtomic = firstInteger(
    preview?.expectedOutputAtomic,
    status.expectedOutputAtomic,
    business?.expectedOutputAtomic,
    root.expectedOutputAtomic
  );
  const minimumOutputAtomic = firstInteger(
    preview?.minimumOutputAtomic,
    status.minimumOutputAtomic,
    business?.minimumOutputAtomic,
    root.minimumOutputAtomic
  );
  const requestedMaximumSpendAtomic = firstInteger(
    tradeSummary?.requestedMaximumSpendAtomic,
    preview?.requestedMaximumSpendAtomic,
    share?.requestedMaximumSpendAtomic,
    input?.maximumSpendAtomic
  );
  const quotedSpend = action === "buy" ? formatAtomicDecimal(quotedInputAtomic, 6, 6) : null;
  const inputAssetAmount = action === "buy" || product.decimals === null ? null : formatAtomicDecimal(quotedInputAtomic, product.decimals, product.decimals);
  const amountDisplay = action === "buy" ? quotedSpend : inputAssetAmount ?? groupedInteger(quotedInputAtomic);
  const selectedAssetLabel = firstString(product.symbol, product.assetId) ?? "asset";
  const amountUnit = action === "buy" ? "USDC" : product.decimals === null ? `${selectedAssetLabel} base units` : selectedAssetLabel;
  const outputDecimals = action === "buy" ? product.decimals : action === "sell" ? 6 : null;
  const copy = stageCopy({
    stage,
    operation,
    action,
    product,
    requestedShares,
    minimumShares,
    quotedSpend,
    amountDisplay,
    amountUnit,
    destinationOwner,
    rawStatus,
    commitment,
    executionSucceeded,
    definitiveNonlandingProof
  });
  const delta = firstRecord(
    status.accountDeltaEvidence,
    business?.accountDeltaEvidence,
    root.accountDeltaEvidence
  );
  const intentId = firstString(status.intentId, root.intentId);
  const reconciliationRequired = firstBoolean(
    status.reconciliationRequired,
    business?.reconciliation && record(business.reconciliation)?.required,
    root.reconciliationRequired
  ) === true;
  const canReconcile = firstBoolean(
    status.canReconcile,
    business?.reconciliation && record(business.reconciliation)?.availableToOwner,
    root.canReconcile
  ) === true;
  const needsStatusCheck = stage === "pending" && (["uncertain", "ambiguous", "reconciliation-required", "unknown"].includes(rawStatus) || commitment !== null || intentId !== null);
  const approvalStatus = firstString(approval?.status)?.toLowerCase();
  const ownerDecision = ownerDecisionOf(ownerDecisionRecord?.status) ?? (approvalStatus === "owner-approval-required" ? "pending" : approvalStatus === "not-required" ? "not-required" : null);
  const policyDecision = policyDecisionOf(status.policyDecision, root.policyDecision);
  const approvalReasons = Array.from(/* @__PURE__ */ new Set([
    ...stringArray(approval?.reasons),
    ...stringArray(status.escalationReasons),
    ...stringArray(business?.refusalOrEscalationReasons)
  ]));
  const approvalRequired = approvalStatus === "owner-approval-required" || firstBoolean(ownerDecisionRecord?.required) === true || policyDecision === "approval_required";
  const recovery = recoveryFor({
    stage,
    operation,
    rawStatus,
    retry: firstString(root.retry),
    retryable: firstBoolean(root.retryable),
    intentId,
    reconciliationRequired,
    canReconcile,
    definitiveNonlandingProof,
    reconcileOutcome: operation === "reconcile" ? firstString(root.outcome) : null
  });
  if (action === "unknown" && !product.assetId && !intentId && !preview && rawStatus === "unknown" && !firstString(root.explanation)) {
    return null;
  }
  return {
    namespace,
    operation,
    stage,
    ...copy,
    action,
    rawStatus,
    needsStatusCheck,
    intentId,
    attemptId: firstString(status.attemptId, root.attemptId),
    requestId: firstString(status.requestId, root.requestId, root.operationId),
    destinationOwner,
    protocolId: firstString(status.protocolId, business?.protocolId, root.protocolId),
    createdAt: firstString(status.createdAt, root.createdAt),
    lastActivityAt: firstString(status.lastActivityAt, root.lastActivityAt),
    product,
    requestAmountKind,
    isShareQuantityOrder: requestAmountKind === "share-quantity",
    requestedShareQuantity: requestedShares,
    expectedShareQuantity: expectedShares,
    minimumShareQuantity: minimumShares,
    shareQuantityUnit: firstString(
      tradeSummary?.shareQuantityUnit,
      preview?.shareQuantityUnit,
      share?.shareQuantityUnit,
      share?.unit
    ),
    shareQuantitySemantics: firstString(
      tradeSummary?.shareQuantitySemantics,
      preview?.shareQuantitySemantics,
      share?.shareQuantitySemantics,
      share?.semantics
    ),
    overfillPossible: firstBoolean(
      tradeSummary?.overfillPossible,
      preview?.overfillPossible,
      share?.overfillPossible
    ) === true,
    quotedInputAtomic,
    expectedOutputAtomic,
    minimumOutputAtomic,
    requestedMaximumSpendAtomic,
    quotedSpend,
    inputAssetAmount,
    expectedOutput: outputDecimals === null ? null : formatAtomicDecimal(expectedOutputAtomic, outputDecimals, outputDecimals),
    minimumOutput: outputDecimals === null ? null : formatAtomicDecimal(minimumOutputAtomic, outputDecimals, outputDecimals),
    requestedMaximumSpend: formatAtomicDecimal(requestedMaximumSpendAtomic, 6, 6),
    amountDisplay,
    amountUnit,
    slippageBps: safeInteger(preview?.slippageBps, 0, 1e4),
    priceImpactBps: safeInteger(preview?.priceImpactBps, 0, 1e4),
    quoteExpiresAtUnixMs: safeInteger(preview?.quoteExpiresAtUnixMs, 0),
    fees: normalizeFees(feeSummary),
    transactionSignature: signature,
    solscanUrl: signature ? `https://solscan.io/tx/${signature}` : null,
    confirmationCommitment: commitment,
    executionSucceeded,
    finalizedEvidence: commitment === "finalized",
    accountDeltaObserved: firstBoolean(delta?.observed),
    accountDeltaMatchesExpected: firstBoolean(delta?.matchesExpected),
    actor: actorOf(status.actor, attribution?.actor, root.actor),
    grantId: firstString(status.grantId, grant?.id, root.grantId),
    grantRevision: safeInteger(
      status.grantRevision ?? grant?.revision ?? root.grantRevision,
      0
    ),
    grantRuleId: firstString(status.grantRuleId, grant?.ruleId, root.grantRuleId),
    authorityExpiresAt: firstString(
      status.authorityExpiresAt,
      grant?.expiresAt,
      root.authorityExpiresAt
    ),
    policyDecision,
    ownerDecision,
    approvalRequired,
    approvalReasons,
    submitted: firstBoolean(status.submitted, execution?.submitted, root.submitted),
    signed: firstBoolean(status.signed, execution?.signed, root.signed),
    landingProof: firstBoolean(status.landingProof, root.landingProof),
    definitiveNonlandingProof,
    settlementFinalized: firstBoolean(
      status.settlementFinalized,
      root.settlementFinalized
    ),
    reconciliationRequired,
    canReconcile,
    reconcileOutcome: operation === "reconcile" ? firstString(root.outcome) : null,
    reconcilePhase: operation === "reconcile" ? firstString(root.phase) : null,
    reconcileMutated: operation === "reconcile" ? firstBoolean(root.mutated) : null,
    receiptPhases: stringArray(status.receiptPhases),
    statusReadSafe: firstBoolean(replay?.statusReadSafe),
    reconcileSameAttemptOnly: firstBoolean(replay?.reconcileSameAttemptOnly),
    executeFromStatusForbidden: firstBoolean(replay?.executeFromStatusForbidden),
    evidenceDigest: firstString(root.evidenceDigest, status.evidenceDigest),
    reconciliationEvidenceDigest: firstString(
      status.reconciliationEvidenceDigest,
      root.reconciliationEvidenceDigest,
      root.digest
    ),
    recovery,
    refusalCode: firstString(
      status.refusalCode,
      root.refusalCode,
      root.code,
      business?.refusalCode
    ),
    explanation: firstString(root.explanation, status.explanation, business?.explanation)
  };
}
function normalizeGovernedHistory(payload) {
  const root = record(payload);
  if (root?.namespace !== "dexter-governed-transaction-history/v1" || !Array.isArray(root.items)) return null;
  const items = root.items.map((item) => normalizeGovernedAction(item)).filter((item) => item !== null);
  const nextCursor = stringValue(root.nextCursor);
  return {
    namespace: "dexter-governed-transaction-history/v1",
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    omittedItems: root.items.length - items.length
  };
}
function displayShareQuantity(value) {
  return displayQuantity(value);
}
function shortenSolanaIdentity(value, size = 5) {
  if (!value) return null;
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}...${value.slice(-size)}`;
}
const XSTOCKS_SYMBOL_URL = new URL("data:image/svg+xml,%3csvg%20width='800'%20height='801'%20viewBox='0%200%20800%20801'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cpath%20d='M800%206.00637C800%202.78947%20797.392%200.181652%20794.175%200.181652L533.333%200.181641L400%20133.515L266.667%200.181652H5.82473C2.60782%200.181652%206.4736e-06%202.78947%206.4736e-06%206.00638V266.848L133.333%20400.182L1.14018e-05%20533.515L0%20794.357C-1.40616e-07%20797.574%202.60782%20800.182%205.82472%20800.182H266.667L400%20666.848L533.333%20800.182H794.175C797.392%20800.182%20800%20797.574%20800%20794.357V533.515L666.667%20400.182L800%20266.848V6.00637Z'%20fill='url(%23paint0_linear_138_3037)'/%3e%3cdefs%3e%3clinearGradient%20id='paint0_linear_138_3037'%20x1='800'%20y1='0.181641'%20x2='6.10352e-05'%20y2='800.182'%20gradientUnits='userSpaceOnUse'%3e%3cstop%20stop-color='%236EC7E2'/%3e%3cstop%20offset='1'%20stop-color='%231FD59A'/%3e%3c/linearGradient%3e%3c/defs%3e%3c/svg%3e", import.meta.url).href;
const XSTOCKS_LEGAL_ISSUER = "Backed Assets (JE) Limited";
const XSTOCKS_PROVIDER_NAMES = /* @__PURE__ */ new Set(["Backed Finance", "xStocks"]);
function CheckIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m5 10 3 3 7-7", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function ExternalIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M11 4h5v5M9 11l7-7M16 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function BackIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M16 10H4m5-5-5 5 5 5", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function StatusMark({ stage }) {
  if (stage === "success") return /* @__PURE__ */ jsxRuntimeExports.jsx(CheckIcon, {});
  if (stage === "failure") return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", children: "x" });
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__status-dot", "aria-hidden": "true" });
}
function formatBps(value) {
  if (value === null) return null;
  const percentage = value / 100;
  return `${percentage.toLocaleString("en-US", {
    minimumFractionDigits: percentage % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}%`;
}
function formatDateTime(value) {
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(void 0, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
function feeLineLabel(amountAtomic, mint) {
  const amount = amountAtomic.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${amount} base units / ${shortenSolanaIdentity(mint, 5) ?? mint}`;
}
function productName(model) {
  return [
    model.product.companyName,
    model.product.productName,
    model.product.symbol,
    model.product.assetId
  ].find((value) => Boolean(value)) ?? "Selected asset";
}
function isOfficialXStocksProduct(model) {
  return model.product.assetClass === "stock" && model.product.legalIssuerName === XSTOCKS_LEGAL_ISSUER && model.product.providerName !== null && XSTOCKS_PROVIDER_NAMES.has(model.product.providerName);
}
function displayCode(value) {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}
function operationLabel(operation) {
  if (operation === "prepare") return "Preparation";
  if (operation === "execute") return "Execution request";
  if (operation === "status") return "Status read";
  if (operation === "reconcile") return "Reconciliation";
  return "Governed action";
}
function exactTerms(model) {
  const requested = displayShareQuantity(model.requestedShareQuantity);
  displayShareQuantity(model.expectedShareQuantity);
  const minimumShares = displayShareQuantity(model.minimumShareQuantity);
  const symbol = model.product.symbol ?? model.product.assetId ?? "asset";
  const terms = [];
  if (model.action === "buy") {
    if (model.quotedSpend) {
      terms.push({ label: "Spend", value: `$${model.quotedSpend}`, detail: "USDC" });
    }
    if (requested) {
      terms.push({
        label: "Buy",
        value: requested,
        detail: requested === "1" ? "share" : "shares"
      });
    } else if (model.expectedOutput) {
      terms.push({ label: "Expected", value: model.expectedOutput, detail: symbol });
    }
    if (minimumShares) {
      terms.push({ label: "Minimum", value: minimumShares, detail: "shares" });
    } else if (model.minimumOutput) {
      terms.push({ label: "Minimum", value: model.minimumOutput, detail: symbol });
    }
  } else if (model.action === "sell") {
    if (model.amountDisplay) {
      terms.push({ label: "Sell", value: model.amountDisplay, detail: model.amountUnit ?? symbol });
    }
    if (model.expectedOutput) {
      terms.push({ label: "Expected", value: `$${model.expectedOutput}`, detail: "USDC" });
    }
    if (model.minimumOutput) {
      terms.push({ label: "Minimum", value: `$${model.minimumOutput}`, detail: "USDC" });
    }
  } else if (model.action === "send") {
    if (model.amountDisplay) {
      terms.push({ label: "Send", value: model.amountDisplay, detail: model.amountUnit ?? symbol });
    }
    const destination = shortenSolanaIdentity(model.destinationOwner, 7);
    if (destination) {
      terms.push({
        label: "To",
        value: destination,
        detail: "Solana address",
        presentation: "identity"
      });
    }
  } else if (model.amountDisplay) {
    terms.push({ label: "Amount", value: model.amountDisplay, detail: model.amountUnit ?? void 0 });
  }
  if (model.requestedMaximumSpend && model.quotedSpend) {
    terms.push({ label: "Spend limit", value: `$${model.requestedMaximumSpend}`, detail: "USDC" });
  }
  return terms;
}
function Economics({ model }) {
  const terms = exactTerms(model);
  if (terms.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "dx-action__terms", "aria-label": "Exact financial terms", children: terms.map((term) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-presentation": term.presentation, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: term.label }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("dd", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: term.value }),
      term.detail ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: term.detail }) : null
    ] })
  ] }, `${term.label}:${term.value}`)) });
}
function AssetIdentity({ model }) {
  const product = model.product;
  if (!product.assetId && !product.productName && !product.symbol) return null;
  const provider = product.providerName ?? (product.assetClass === "stock" ? product.issuer : null);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-action__section", "aria-labelledby": "dx-action-asset-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { id: "dx-action-asset-title", children: "Asset" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-action__asset", children: [
      isOfficialXStocksProduct(model) ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "img",
        {
          src: XSTOCKS_SYMBOL_URL,
          alt: "",
          "aria-hidden": "true",
          width: 32,
          height: 32,
          className: "dx-action__asset-mark"
        }
      ) : null,
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: productName(model) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: [product.symbol, provider ? `Provider: ${provider}` : null].filter(Boolean).join(" / ") })
      ] })
    ] })
  ] });
}
function approvalLabel(model) {
  if (model.ownerDecision === "approved") return "Approved by owner";
  if (model.ownerDecision === "refused") return "Refused by owner";
  if (model.approvalRequired || model.ownerDecision === "pending") return "Pending in Dexter Wallet";
  if (model.ownerDecision === "not-required") return "Not required";
  return "Not reported";
}
function Authority({ model }) {
  const grant = shortenSolanaIdentity(model.grantId, 6);
  const expires = formatDateTime(model.authorityExpiresAt);
  const authorityPresent = model.actor !== "unknown" || grant !== null || model.policyDecision !== null || model.ownerDecision !== null || model.approvalRequired;
  if (!authorityPresent) return null;
  const authoritySentence = model.actor === "agent" ? grant ? `Agent authority came from mandate ${grant}.` : "Dexter recorded agent authority for this action." : model.actor === "owner" ? "The wallet owner acted directly." : "Dexter returned an authority decision for this action.";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-action__section", "aria-labelledby": "dx-action-authority-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { id: "dx-action-authority-title", children: "Authority" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: authoritySentence }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dx-action__facts", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Owner approval" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: approvalLabel(model) })
      ] }),
      model.policyDecision ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Policy" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: model.policyDecision === "allowed" ? "Within mandate" : "Approval required" })
      ] }) : null,
      model.grantRevision !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Mandate revision" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: model.grantRevision.toLocaleString("en-US") })
      ] }) : null,
      expires ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Authority expires" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: expires })
      ] }) : null
    ] }),
    model.approvalRequired && model.ownerDecision !== "approved" ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-action__approval-note", children: "Approval belongs in Dexter Wallet. This view cannot grant it or execute the action." }) : null,
    model.approvalReasons.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-action__reasons", children: model.approvalReasons.map(displayCode).join(", ") }) : null
  ] });
}
function executionSentence(model) {
  if (model.stage === "success") {
    return model.confirmationCommitment === "finalized" ? "Finalized on Solana with successful execution." : "Confirmed on Solana with successful execution.";
  }
  if (model.definitiveNonlandingProof) return "Dexter proved that the transaction did not land.";
  if (model.stage === "prepared") return "The action is unsigned and has not been submitted.";
  if (model.rawStatus === "signed") return "The transaction is signed; submission and landing remain unproven.";
  if (model.submitted === true) return "The transaction was submitted; landing and execution remain unproven.";
  if (model.stage === "failure") return "The action stopped without successful execution.";
  return "The execution outcome remains open.";
}
function Execution({ model }) {
  const signature = shortenSolanaIdentity(model.transactionSignature, 7);
  const chainStatus = model.confirmationCommitment ? model.confirmationCommitment === "finalized" ? "Finalized" : "Confirmed" : model.definitiveNonlandingProof ? "Proven not landed" : model.landingProof === true ? "Landed" : model.submitted === true ? "Submitted" : "No landing proof";
  const executionStatus = model.executionSucceeded === true ? "Succeeded" : model.executionSucceeded === false ? "Failed" : "Unproven";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "dx-action__section", "aria-labelledby": "dx-action-execution-title", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { id: "dx-action-execution-title", children: "Execution" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: executionSentence(model) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "dx-action__facts dx-action__facts--evidence", "aria-live": "polite", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-evidence": "commitment", "data-result": model.confirmationCommitment ? "confirmed" : "unconfirmed", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Solana status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: chainStatus })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { "data-evidence": "execution", "data-result": model.executionSucceeded === true ? "succeeded" : model.executionSucceeded === false ? "failed" : "unknown", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Execution" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: executionStatus })
      ] }),
      signature ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: "Signature" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { title: model.transactionSignature ?? void 0, children: signature })
      ] }) : null
    ] })
  ] });
}
function ReceiptDetails({ model }) {
  const fields = [
    { label: "Operation", value: operationLabel(model.operation) },
    model.intentId ? { label: "Intent", value: shortenSolanaIdentity(model.intentId, 7) ?? model.intentId } : null,
    model.attemptId ? { label: "Attempt", value: shortenSolanaIdentity(model.attemptId, 7) ?? model.attemptId } : null,
    model.requestId ? { label: "Request", value: shortenSolanaIdentity(model.requestId, 7) ?? model.requestId } : null,
    model.protocolId ? { label: "Protocol", value: model.protocolId } : null,
    model.product.mint ? { label: "Mint", value: shortenSolanaIdentity(model.product.mint, 7) ?? model.product.mint } : null,
    model.product.tokenProgram ? { label: "Token standard", value: model.product.tokenProgram === "token-2022" ? "Token-2022" : model.product.tokenProgram } : null,
    model.product.legalIssuerName ? { label: "Legal issuer", value: model.product.legalIssuerName } : null,
    model.reconcileOutcome ? { label: "Reconciliation", value: displayCode(model.reconcileOutcome) } : null,
    model.reconcilePhase ? { label: "Reconciliation phase", value: displayCode(model.reconcilePhase) } : null,
    model.reconcileMutated !== null ? { label: "Reconciliation change", value: model.reconcileMutated ? "State advanced" : "No state change" } : null,
    model.settlementFinalized !== null ? { label: "Settlement finality", value: model.settlementFinalized ? "Finalized" : "Not finalized" } : null,
    model.accountDeltaObserved !== null ? { label: "Account delta", value: model.accountDeltaObserved ? "Observed" : "Not observed" } : null,
    model.accountDeltaMatchesExpected !== null ? { label: "Expected delta", value: model.accountDeltaMatchesExpected ? "Matched" : "Did not match" } : null,
    model.statusReadSafe === true ? { label: "Status read", value: "Read-only" } : null,
    model.reconcileSameAttemptOnly === true ? { label: "Reconciliation scope", value: "Same attempt only" } : null,
    model.executeFromStatusForbidden === true ? { label: "Execute from status", value: "Forbidden" } : null,
    model.receiptPhases.length > 0 ? { label: "Receipt phases", value: model.receiptPhases.map(displayCode).join(", ") } : null,
    model.evidenceDigest ? { label: "Execution evidence", value: shortenSolanaIdentity(model.evidenceDigest, 7) ?? model.evidenceDigest } : null,
    model.reconciliationEvidenceDigest ? { label: "Reconciliation evidence", value: shortenSolanaIdentity(model.reconciliationEvidenceDigest, 7) ?? model.reconciliationEvidenceDigest } : null
  ].filter((field) => field !== null);
  if (fields.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "dx-action__details", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: "Receipt details" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "dx-action__receipt-grid", children: fields.map((field) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: field.label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { title: field.value, children: field.value })
    ] }, `${field.label}:${field.value}`)) })
  ] });
}
function QuoteDetails({ model }) {
  const expected = displayShareQuantity(model.expectedShareQuantity);
  const minimum = displayShareQuantity(model.minimumShareQuantity);
  const slippage = formatBps(model.slippageBps);
  const priceImpact = formatBps(model.priceImpactBps);
  const expiry = formatDateTime(model.quoteExpiresAtUnixMs);
  const feeLines = model.fees ? [
    model.fees.platformFee ? ["Platform fee", feeLineLabel(
      model.fees.platformFee.amountAtomic,
      model.fees.platformFee.mint
    )] : null,
    ...model.fees.routeFees.map((fee, index) => [
      `Route fee ${index + 1}`,
      feeLineLabel(fee.amountAtomic, fee.mint)
    ])
  ].filter((field) => field !== null) : [];
  const fields = [
    expected ? ["Expected shares", expected] : null,
    minimum ? ["Minimum shares", minimum] : null,
    slippage ? ["Slippage limit", slippage] : null,
    priceImpact ? ["Price-impact limit", priceImpact] : null,
    expiry ? ["Quote expires", expiry] : null,
    model.fees ? ["Fees", model.fees.summary] : null,
    model.fees?.networkFeeStatus === "not-yet-calculated" ? ["Network fee", "Calculated at execution"] : model.fees?.networkFeeLamports ? ["Network fee", `${formatAtomicDecimal(model.fees.networkFeeLamports, 9, 9) ?? model.fees.networkFeeLamports} SOL`] : null,
    ...feeLines
  ].filter((field) => field !== null);
  if (fields.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "dx-action__details", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { children: "Quote details" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("dl", { className: "dx-action__receipt-grid", children: fields.map(([label, value]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { children: label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { children: value })
    ] }, label)) })
  ] });
}
function GovernedLoading({ maxHeight }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    WidgetShell,
    {
      width: "full",
      style: maxHeight ? { maxHeight, overflowY: "auto" } : void 0,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-action dx-action--loading", role: "status", "aria-live": "polite", "aria-label": "Loading governed action", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton dx-action__skeleton--state" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton dx-action__skeleton--title" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton dx-action__skeleton--copy" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-action__skeleton-terms", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "dx-action__skeleton" })
        ] })
      ] })
    }
  );
}
function GovernedActionDetail({
  model,
  openExternal,
  onBack
}) {
  const updated = formatDateTime(model.lastActivityAt ?? model.createdAt);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "dx-action", "data-stage": model.stage, "aria-live": "polite", children: [
    onBack ? /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", className: "dx-action__back", onClick: onBack, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(BackIcon, {}),
      "Back to history"
    ] }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "dx-action__header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "dx-action__status", "data-stage": model.stage, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(StatusMark, { stage: model.stage }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: model.stageLabel }),
        updated ? /* @__PURE__ */ jsxRuntimeExports.jsx("time", { dateTime: model.lastActivityAt ?? model.createdAt ?? void 0, children: updated }) : null
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: model.headline }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: model.supporting })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Economics, { model }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Authority, { model }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Execution, { model }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AssetIdentity, { model }),
    model.explanation && model.explanation !== model.supporting ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-action__explanation", role: model.stage === "failure" ? "alert" : void 0, children: model.explanation }) : null,
    model.recovery.sentence ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "dx-action__recovery", "data-kind": model.recovery.kind, role: "status", children: model.recovery.sentence }) : null,
    /* @__PURE__ */ jsxRuntimeExports.jsx(QuoteDetails, { model }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ReceiptDetails, { model }),
    model.solscanUrl ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        className: "dx-action__external",
        onClick: () => openExternal(model.solscanUrl),
        "aria-label": "View this transaction on Solscan",
        children: [
          "View on Solscan",
          /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalIcon, {})
        ]
      }
    ) : null
  ] });
}
function GovernedActionView() {
  const output = useToolOutput();
  const responseMetadata = useToolResponseMetadata();
  const renderOutput = output ?? responseMetadata?.["dexter/governedWidgetResult"] ?? null;
  const input = useToolInput();
  const theme = useAdaptiveTheme();
  const maxHeight = useAdaptiveMaxHeight();
  const openExternal = useAdaptiveOpenExternal();
  const model = reactExports.useMemo(
    () => normalizeGovernedAction(renderOutput, input),
    [renderOutput, input]
  );
  reactExports.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  if (renderOutput === null) return /* @__PURE__ */ jsxRuntimeExports.jsx(GovernedLoading, { maxHeight });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    WidgetShell,
    {
      width: "full",
      style: maxHeight ? { maxHeight, overflowY: "auto" } : void 0,
      children: model ? /* @__PURE__ */ jsxRuntimeExports.jsx(GovernedActionDetail, { model, openExternal }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
        WidgetEmpty,
        {
          title: "No governed-action details available",
          description: "Read the same intent again. This view will not start an execution."
        }
      )
    }
  );
}
export {
  GovernedActionDetail as G,
  WidgetShell as W,
  WidgetError as a,
  WidgetEmpty as b,
  GovernedActionView as c,
  normalizeGovernedHistory as n
};
