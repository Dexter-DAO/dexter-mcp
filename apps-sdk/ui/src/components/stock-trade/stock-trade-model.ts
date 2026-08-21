import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export type StockTradeStage = 'prepared' | 'pending' | 'success' | 'failure';

export type StockProductIdentity = {
  assetId: string | null;
  assetClass: string | null;
  companyName: string | null;
  productName: string | null;
  symbol: string | null;
  providerName: string | null;
  legalIssuerName: string | null;
  /** Deprecated compatibility field. New responses use legalIssuerName. */
  issuer: string | null;
  network: string | null;
  mint: string | null;
  tokenProgram: string | null;
  decimals: number | null;
  registryIdentityDigest: string | null;
};

export type StockFeeLine = {
  amountAtomic: string;
  mint: string;
};

export type StockFeeSummary = {
  summary: string;
  platformFee: StockFeeLine | null;
  routeFees: StockFeeLine[];
  networkFeeStatus: string | null;
  networkFeeLamports: string | null;
};

export type StockTradeViewModel = {
  stage: StockTradeStage;
  stageLabel: string;
  headline: string;
  supporting: string;
  action: 'buy' | 'sell' | 'send' | 'unknown';
  rawStatus: string;
  needsStatusCheck: boolean;
  intentId: string | null;
  product: StockProductIdentity;
  requestAmountKind: 'input' | 'share-quantity';
  isShareQuantityOrder: boolean;
  requestedShareQuantity: string | null;
  expectedShareQuantity: string | null;
  minimumShareQuantity: string | null;
  shareQuantityUnit: string | null;
  shareQuantitySemantics: string | null;
  overfillPossible: boolean;
  quotedInputAtomic: string | null;
  expectedOutputAtomic: string | null;
  minimumOutputAtomic: string | null;
  requestedMaximumSpendAtomic: string | null;
  quotedSpend: string | null;
  inputAssetAmount: string | null;
  expectedOutput: string | null;
  minimumOutput: string | null;
  requestedMaximumSpend: string | null;
  slippageBps: number | null;
  priceImpactBps: number | null;
  quoteExpiresAtUnixMs: number | null;
  fees: StockFeeSummary | null;
  transactionSignature: string | null;
  solscanUrl: string | null;
  confirmationCommitment: 'confirmed' | 'finalized' | null;
  executionSucceeded: boolean | null;
  finalizedEvidence: boolean;
  accountDeltaObserved: boolean | null;
  accountDeltaMatchesExpected: boolean | null;
  explanation: string | null;
};

type UnknownRecord = Record<string, unknown>;

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_INDEX = new Map(
  [...BASE58_ALPHABET].map((character, index) => [character, index]),
);
const INTEGER = /^(0|[1-9][0-9]*)$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integerString(value: unknown): string | null {
  const candidate = stringValue(value);
  return candidate && INTEGER.test(candidate) ? candidate : null;
}

function decimalString(value: unknown): string | null {
  const candidate = stringValue(value);
  return candidate && DECIMAL.test(candidate) ? candidate : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function firstRecord(...values: unknown[]): UnknownRecord | null {
  for (const value of values) {
    const candidate = record(value);
    if (candidate) return candidate;
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const candidate = stringValue(value);
    if (candidate) return candidate;
  }
  return null;
}

function firstDecimal(...values: unknown[]): string | null {
  for (const value of values) {
    const candidate = decimalString(value);
    if (candidate) return candidate;
  }
  return null;
}

function firstInteger(...values: unknown[]): string | null {
  for (const value of values) {
    const candidate = integerString(value);
    if (candidate) return candidate;
  }
  return null;
}

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    const candidate = booleanValue(value);
    if (candidate !== null) return candidate;
  }
  return null;
}

function decodedBase58ByteLength(value: string): number | null {
  if (!value) return null;
  const bytes = [0];
  for (const character of value) {
    const digit = BASE58_INDEX.get(character);
    if (digit === undefined) return null;
    let carry = digit;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeroBytes = 0;
  while (leadingZeroBytes < value.length && value[leadingZeroBytes] === '1') {
    leadingZeroBytes += 1;
  }
  const magnitudeBytes = bytes.length === 1 && bytes[0] === 0
    ? 0
    : bytes.length;
  return leadingZeroBytes + magnitudeBytes;
}

function safeNumber(value: unknown): number | null {
  const direct = numberValue(value);
  if (direct !== null) return direct;
  const candidate = stringValue(value);
  if (!candidate) return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProduct(
  identity: UnknownRecord | null,
  preview: UnknownRecord | null,
  business: UnknownRecord | null,
  status: UnknownRecord,
): StockProductIdentity {
  return {
    assetId: firstString(
      identity?.assetId,
      preview?.assetId,
      business?.assetId,
      status.assetId,
    ),
    assetClass: firstString(identity?.assetClass),
    companyName: firstString(identity?.companyName),
    productName: firstString(identity?.productName),
    symbol: firstString(identity?.symbol, preview?.symbol),
    providerName: firstString(identity?.providerName),
    legalIssuerName: firstString(identity?.legalIssuerName),
    issuer: firstString(identity?.issuer),
    network: firstString(identity?.network, 'solana-mainnet'),
    mint: firstString(
      identity?.mint,
      status.assetMint,
      preview?.outputMint,
    ),
    tokenProgram: firstString(identity?.tokenProgram, status.tokenProgram),
    decimals: safeNumber(identity?.decimals),
    registryIdentityDigest: firstString(identity?.registryIdentityDigest),
  };
}

function feeLine(value: unknown): StockFeeLine | null {
  const candidate = record(value);
  if (!candidate) return null;
  const amountAtomic = integerString(candidate.amountAtomic);
  const mint = stringValue(candidate.mint);
  return amountAtomic && mint ? { amountAtomic, mint } : null;
}

function normalizeFees(value: UnknownRecord | null): StockFeeSummary | null {
  if (!value) return null;
  const summary = stringValue(value.summary);
  const networkFee = record(value.networkFee);
  if (!summary || !networkFee) return null;
  const routeFees = Array.isArray(value.routeFees)
    ? value.routeFees.map(feeLine).filter((item): item is StockFeeLine => item !== null)
    : [];
  return {
    summary,
    platformFee: feeLine(value.platformFee),
    routeFees,
    networkFeeStatus: stringValue(networkFee.status),
    networkFeeLamports: integerString(networkFee.amountLamports),
  };
}

export function formatAtomicDecimal(
  value: string | null,
  decimals: number,
  maximumFractionDigits = decimals,
): string | null {
  if (!value || !INTEGER.test(value) || !Number.isInteger(decimals) || decimals < 0) {
    return null;
  }
  const padded = value.padStart(decimals + 1, '0');
  const integer = decimals === 0 ? padded : padded.slice(0, -decimals);
  const rawFraction = decimals === 0 ? '' : padded.slice(-decimals);
  const fraction = rawFraction
    .slice(0, Math.max(0, maximumFractionDigits))
    .replace(/0+$/, '');
  const grouped = BigInt(integer).toLocaleString('en-US');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function displayQuantity(value: string | null): string | null {
  if (!value) return null;
  const [integer, fraction = ''] = value.split('.');
  const grouped = BigInt(integer).toLocaleString('en-US');
  const trimmed = fraction.slice(0, 8).replace(/0+$/, '');
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

function actionOf(...values: unknown[]): StockTradeViewModel['action'] {
  const action = firstString(...values)?.toLowerCase();
  return action === 'buy' || action === 'sell' || action === 'send'
    ? action
    : 'unknown';
}

function commitmentOf(...values: unknown[]): 'confirmed' | 'finalized' | null {
  const commitment = firstString(...values)?.toLowerCase();
  return commitment === 'confirmed' || commitment === 'finalized'
    ? commitment
    : null;
}

function exactSignature(...values: unknown[]): string | null {
  const signature = firstString(...values);
  return signature && decodedBase58ByteLength(signature) === 64
    ? signature
    : null;
}

function exactStringAgreement(...values: unknown[]): boolean {
  const present = values.filter((value): value is string => (
    typeof value === 'string' && value.length > 0
  ));
  return present.length > 0 && present.every((value) => value === present[0]);
}

function exactNumberAgreement(...values: unknown[]): boolean {
  const present = values.filter((value): value is number => (
    typeof value === 'number' && Number.isSafeInteger(value)
  ));
  return present.length > 0 && present.every((value) => value === present[0]);
}

function exactStockProductIdentity(product: UnknownRecord): boolean {
  return firstString(product.assetClass) === 'stock'
    && firstString(product.companyName) !== null
    && firstString(product.productName) !== null
    && firstString(product.providerName) !== null
    && firstString(product.legalIssuerName) !== null
    && exactStringAgreement(product.issuer, product.legalIssuerName)
    && firstString(product.registryIdentityDigest) !== null
    && exactNumberAgreement(product.decimals);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('non_integer_identity_number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (
    !value
    || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError('unsupported_governed_identity_value');
  }
  const entries = Object.entries(value as UnknownRecord).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, item]) => {
    if (item === undefined) {
      throw new TypeError(`undefined_governed_identity_value:${key}`);
    }
    return `${JSON.stringify(key)}:${canonicalJson(item)}`;
  }).join(',')}}`;
}

function stockTradeSummarySnapshotDigest(summary: UnknownRecord): string | null {
  const product = record(summary.productIdentity);
  if (
    product === null
    || summary.namespace !== 'dexter-governed-stock-trade-summary/v1'
  ) return null;
  try {
    const snapshot = {
      namespace: 'dexter-governed-stock-prepare-summary-snapshot/v1',
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
        registryIdentityDigest: product.registryIdentityDigest,
      },
    };
    return bytesToHex(sha256(utf8ToBytes(canonicalJson(snapshot))));
  } catch {
    return null;
  }
}

function exactSuccessEnvelopeIdentity(input: {
  root: UnknownRecord;
  status: UnknownRecord;
  business: UnknownRecord | null;
  tradeSummary: UnknownRecord | null;
}): boolean {
  const selection = record(input.status.stockSelection);
  const durableIdentity = record(input.status.stockV2Identity);
  const product = record(input.tradeSummary?.productIdentity);
  const intentId = firstString(input.status.intentId, input.root.intentId);
  const durableSummaryDigest = firstString(
    durableIdentity?.tradeSummarySnapshotDigest,
  );
  if (
    intentId === null
    || !exactStringAgreement(
      input.status.intentId,
      input.root.intentId,
      durableIdentity?.intentId,
    )
  ) return false;
  if (
    durableIdentity !== null
    && (
      selection === null
      || input.tradeSummary === null
      || firstString(durableIdentity.intentId) !== intentId
      || durableIdentity.namespace
        !== 'dexter-governed-stock-v2-durable-identity/v1'
      || durableSummaryDigest === null
      || !SHA256_HEX.test(durableSummaryDigest)
      || stockTradeSummarySnapshotDigest(input.tradeSummary)
        !== durableSummaryDigest
    )
  ) return false;
  if (selection !== null && durableIdentity === null) return false;
  if (input.tradeSummary === null) {
    return exactStringAgreement(input.status.action, input.business?.action)
      && exactStringAgreement(input.status.assetId, input.business?.assetId)
      && exactStringAgreement(
        input.status.amountAtomic,
        input.business?.amountAtomic,
      );
  }
  if (product === null || !exactStockProductIdentity(product)) return false;
  return exactStringAgreement(
    input.tradeSummary.action,
    input.status.action,
    input.business?.action,
  )
    && exactStringAgreement(
      input.tradeSummary.assetId,
      product.assetId,
      selection?.assetId,
      input.status.assetId,
      input.business?.assetId,
    )
    && exactStringAgreement(
      input.tradeSummary.amountAtomic,
      input.status.amountAtomic,
      input.business?.amountAtomic,
    )
    && exactStringAgreement(
      product.mint,
      selection?.mint,
      input.status.assetMint,
    )
    && exactStringAgreement(
      product.tokenProgram,
      selection?.tokenProgram,
      input.status.tokenProgram,
    )
    && (
      selection === null
      || (
        exactStringAgreement(
          input.tradeSummary.symbol,
          product.symbol,
          selection.productSymbol,
        )
        && exactStringAgreement(product.companyName, selection.companyName)
        && exactStringAgreement(product.productName, selection.productName)
        && exactStringAgreement(product.providerName, selection.providerName)
        && exactStringAgreement(
          product.legalIssuerName,
          product.issuer,
          selection.legalIssuerName,
        )
        && exactStringAgreement(
          product.registryIdentityDigest,
          selection.registryIdentityDigest,
        )
        && exactNumberAgreement(product.decimals, selection.decimals)
      )
    );
}

function productLabel(product: StockProductIdentity): string {
  return product.companyName
    ?? product.productName
    ?? product.symbol
    ?? product.assetId
    ?? 'asset';
}

function sharePhrase(quantity: string | null): string {
  const displayed = displayQuantity(quantity);
  if (!displayed) return 'the requested amount';
  return `${displayed} ${displayed === '1' ? 'share' : 'shares'}`;
}

function classifyStage(input: {
  rawStatus: string;
  signature: string | null;
  commitment: 'confirmed' | 'finalized' | null;
  executionSucceeded: boolean | null;
  programError: boolean;
  definitiveNonlandingProof: boolean;
  identityExact: boolean;
}): StockTradeStage {
  // This is the complete success predicate. No lifecycle label, account-delta
  // receipt, or finalized commitment may add another user-visible gate.
  if (
    input.signature !== null
    && input.commitment !== null
    && input.executionSucceeded === true
    && input.identityExact
  ) {
    return 'success';
  }
  if (
    input.executionSucceeded === false
    || input.programError
    || input.definitiveNonlandingProof
    || ['failed', 'refused', 'provably_not_landed'].includes(input.rawStatus)
  ) {
    return 'failure';
  }
  if (input.rawStatus === 'prepared') return 'prepared';
  return 'pending';
}

function stageCopy(input: {
  stage: StockTradeStage;
  action: StockTradeViewModel['action'];
  product: StockProductIdentity;
  requestedShares: string | null;
  minimumShares: string | null;
  quotedSpend: string | null;
  isShareQuantityOrder: boolean;
  rawStatus: string;
  commitment: 'confirmed' | 'finalized' | null;
  executionSucceeded: boolean | null;
}): Pick<StockTradeViewModel, 'stageLabel' | 'headline' | 'supporting'> {
  const product = productLabel(input.product);
  const action = input.action === 'unknown' ? 'trade' : input.action;
  const target = sharePhrase(input.requestedShares ?? input.minimumShares);

  if (input.stage === 'success') {
    const shareTarget = displayQuantity(
      input.requestedShares ?? input.minimumShares,
    );
    return {
      stageLabel: 'Confirmed',
      headline: input.action === 'buy'
        ? shareTarget
          ? `${shareTarget}-share ${product} purchase confirmed`
          : `${product} purchase confirmed`
        : `${product} ${action} confirmed`,
      supporting: input.action === 'buy'
        ? `Solana confirmed the transaction, and Dexter reports that execution succeeded${input.requestedShares ? ` for at least ${target}` : ''}.`
        : `Solana confirmed this ${action}.`,
    };
  }
  if (input.stage === 'failure') {
    return {
      stageLabel: 'Failed',
      headline: input.action === 'buy'
        ? `${product} purchase failed`
        : `${product} ${action} failed`,
      supporting: 'The transaction did not complete successfully. No success is being claimed.',
    };
  }
  if (input.stage === 'prepared') {
    const preparedState = input.action === 'buy'
      ? 'bought'
      : input.action === 'sell'
        ? 'sold'
        : input.action === 'send'
          ? 'sent'
          : 'submitted';
    return {
      stageLabel: 'Preview',
      headline: input.action === 'buy'
        ? input.isShareQuantityOrder
          ? `Buy ${target} of ${product}`
          : input.quotedSpend
            ? `Buy $${input.quotedSpend} of ${product}`
            : `Buy ${product}`
        : `${action[0]?.toUpperCase() ?? ''}${action.slice(1)} ${product}`,
      supporting: `Review the exact Solana asset and quote. This is prepared, not yet ${preparedState}.`,
    };
  }
  if (input.commitment !== null && input.executionSucceeded !== true) {
    return {
      stageLabel: 'Confirming',
      headline: `${product} ${input.action === 'buy' ? 'purchase' : action} is being verified`,
      supporting: 'Solana confirmation is present, but the execution result is not yet proven successful.',
    };
  }
  if (['uncertain', 'ambiguous', 'reconciliation-required', 'unknown'].includes(input.rawStatus)) {
    return {
      stageLabel: 'Needs check',
      headline: `${product} ${input.action === 'buy' ? 'purchase' : action} needs a status check`,
      supporting: 'Dexter will inspect this same transaction. It will not place a replacement trade.',
    };
  }
  return {
    stageLabel: 'Confirming',
    headline: `${product} ${input.action === 'buy' ? 'purchase' : action} is confirming`,
    supporting: input.rawStatus === 'signed'
      ? 'The trade is signed and waiting to be sent or confirmed on Solana.'
      : 'The trade is waiting for Solana confirmation.',
  };
}

/**
 * Build the human result card from any of the prepare, execute, status, or
 * reconcile governed-action envelopes. The success predicate is deliberately
 * narrow: exact Solana signature + confirmed-or-finalized commitment +
 * executionSucceeded=true. Finalization is optional evidence, never a gate.
 */
export function normalizeStockTrade(
  payload: unknown,
  toolInput: unknown = null,
): StockTradeViewModel | null {
  const root = record(payload);
  if (!root) return null;
  const input = record(toolInput);
  const statusAfter = record(root.statusAfter);
  const status = statusAfter ?? root;
  const preview = firstRecord(root.preview, status.preview);
  const business = firstRecord(status.business, root.business);
  const tradeSummary = firstRecord(status.tradeSummary, root.tradeSummary);
  const share = firstRecord(
    preview?.shareQuantity,
    status.shareQuantity,
    business?.shareQuantity,
    root.shareQuantity,
  );
  const productIdentity = firstRecord(
    tradeSummary?.productIdentity,
    preview?.productIdentity,
    status.productIdentity,
    business?.productIdentity,
    root.productIdentity,
  );
  const feeSummary = firstRecord(
    tradeSummary?.feeSummary,
    preview?.feeSummary,
    status.feeSummary,
    business?.feeSummary,
    root.feeSummary,
  );

  const action = actionOf(
    tradeSummary?.action,
    preview?.action,
    status.action,
    business?.action,
    root.action,
    input?.action,
  );
  const product = normalizeProduct(productIdentity, preview, business, status);
  const requestedShares = firstDecimal(
    tradeSummary?.requestedShareQuantity,
    preview?.requestedShareQuantity,
    share?.requestedShareQuantity,
    status.requestedShareQuantity,
    root.requestedShareQuantity,
    input?.shareQuantity,
  );
  const expectedShares = firstDecimal(
    tradeSummary?.expectedShareQuantity,
    preview?.expectedShareQuantity,
    share?.expectedShareQuantity,
    status.expectedShareQuantity,
    root.expectedShareQuantity,
  );
  const minimumShares = firstDecimal(
    tradeSummary?.minimumShareQuantity,
    preview?.minimumShareQuantity,
    share?.minimumShareQuantity,
    status.minimumShareQuantity,
    root.minimumShareQuantity,
  );
  const requestAmountKind = firstString(
    tradeSummary?.requestAmountKind,
    preview?.requestAmountKind,
  ) === 'share-quantity'
    || requestedShares !== null
    ? 'share-quantity' as const
    : 'input' as const;
  const rawStatus = (
    firstString(status.status, business?.lifecycle, root.status, root.outcome)
    ?? (preview ? 'prepared' : 'unknown')
  ).toLowerCase();
  const signature = exactSignature(
    status.transactionSignature,
    business?.transactionSignature,
    root.transactionSignature,
  );
  const commitment = commitmentOf(
    status.confirmationCommitment,
    business?.finality,
    status.finality,
    root.confirmationCommitment,
  );
  const executionSucceeded = firstBoolean(
    status.executionSucceeded,
    business?.executionSucceeded,
    root.executionSucceeded,
  );
  const programError = firstBoolean(status.programError, business?.programError) === true;
  const definitiveNonlandingProof = firstBoolean(
    status.definitiveNonlandingProof,
    business?.definitiveNonlandingProof,
  ) === true;
  const identityExact = exactSuccessEnvelopeIdentity({
    root,
    status,
    business,
    tradeSummary,
  });
  const stage = classifyStage({
    rawStatus,
    signature,
    commitment,
    executionSucceeded,
    programError,
    definitiveNonlandingProof,
    identityExact,
  });
  const quotedInputAtomic = firstInteger(
    tradeSummary?.amountAtomic,
    preview?.maximumInputAmountAtomic,
    preview?.amountAtomic,
    business?.amountAtomic,
    status.amountAtomic,
  );
  const expectedOutputAtomic = firstInteger(
    preview?.expectedOutputAtomic,
    status.expectedOutputAtomic,
    business?.expectedOutputAtomic,
    root.expectedOutputAtomic,
  );
  const minimumOutputAtomic = firstInteger(
    preview?.minimumOutputAtomic,
    status.minimumOutputAtomic,
    business?.minimumOutputAtomic,
    root.minimumOutputAtomic,
  );
  const requestedMaximumSpendAtomic = firstInteger(
    tradeSummary?.requestedMaximumSpendAtomic,
    preview?.requestedMaximumSpendAtomic,
    share?.requestedMaximumSpendAtomic,
    input?.maximumSpendAtomic,
  );
  const quotedSpend = action === 'buy'
    ? formatAtomicDecimal(quotedInputAtomic, 6, 6)
    : null;
  const outputDecimals = action === 'buy'
    ? product.decimals
    : action === 'sell'
      ? 6
      : null;
  const copy = stageCopy({
    stage,
    action,
    product,
    requestedShares,
    minimumShares,
    quotedSpend,
    isShareQuantityOrder: requestAmountKind === 'share-quantity',
    rawStatus,
    commitment,
    executionSucceeded,
  });
  const delta = firstRecord(
    status.accountDeltaEvidence,
    business?.accountDeltaEvidence,
    root.accountDeltaEvidence,
  );
  const intentId = firstString(status.intentId, root.intentId);
  const needsStatusCheck = stage === 'pending' && (
    ['uncertain', 'ambiguous', 'reconciliation-required', 'unknown'].includes(rawStatus)
    || commitment !== null
  );

  if (
    action === 'unknown'
    && !product.assetId
    && !intentId
    && !preview
    && rawStatus === 'unknown'
  ) {
    return null;
  }

  return {
    stage,
    ...copy,
    action,
    rawStatus,
    needsStatusCheck,
    intentId,
    product,
    requestAmountKind,
    isShareQuantityOrder: requestAmountKind === 'share-quantity',
    requestedShareQuantity: requestedShares,
    expectedShareQuantity: expectedShares,
    minimumShareQuantity: minimumShares,
    shareQuantityUnit: firstString(
      tradeSummary?.shareQuantityUnit,
      preview?.shareQuantityUnit,
      share?.shareQuantityUnit,
      share?.unit,
    ),
    shareQuantitySemantics: firstString(
      tradeSummary?.shareQuantitySemantics,
      preview?.shareQuantitySemantics,
      share?.shareQuantitySemantics,
      share?.semantics,
    ),
    overfillPossible: firstBoolean(
      tradeSummary?.overfillPossible,
      preview?.overfillPossible,
      share?.overfillPossible,
    ) === true,
    quotedInputAtomic,
    expectedOutputAtomic,
    minimumOutputAtomic,
    requestedMaximumSpendAtomic,
    quotedSpend,
    inputAssetAmount: action === 'buy' || product.decimals === null
      ? null
      : formatAtomicDecimal(quotedInputAtomic, product.decimals, product.decimals),
    expectedOutput: outputDecimals === null
      ? null
      : formatAtomicDecimal(expectedOutputAtomic, outputDecimals, outputDecimals),
    minimumOutput: outputDecimals === null
      ? null
      : formatAtomicDecimal(minimumOutputAtomic, outputDecimals, outputDecimals),
    requestedMaximumSpend: formatAtomicDecimal(requestedMaximumSpendAtomic, 6, 6),
    slippageBps: safeNumber(preview?.slippageBps),
    priceImpactBps: safeNumber(preview?.priceImpactBps),
    quoteExpiresAtUnixMs: safeNumber(preview?.quoteExpiresAtUnixMs),
    fees: normalizeFees(feeSummary),
    transactionSignature: signature,
    solscanUrl: signature ? `https://solscan.io/tx/${signature}` : null,
    confirmationCommitment: commitment,
    executionSucceeded,
    finalizedEvidence: commitment === 'finalized',
    accountDeltaObserved: firstBoolean(delta?.observed),
    accountDeltaMatchesExpected: firstBoolean(delta?.matchesExpected),
    explanation: firstString(root.explanation, status.explanation, business?.explanation),
  };
}

export function displayShareQuantity(value: string | null): string | null {
  return displayQuantity(value);
}

export function shortenSolanaIdentity(value: string | null, size = 5): string | null {
  if (!value) return null;
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}
