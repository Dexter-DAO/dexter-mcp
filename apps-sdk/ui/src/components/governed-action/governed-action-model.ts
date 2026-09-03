import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export type GovernedActionStage = 'prepared' | 'pending' | 'success' | 'failure';

export type GovernedActionOperation =
  | 'prepare'
  | 'execute'
  | 'status'
  | 'reconcile'
  | 'unknown';

export type GovernedAssetIdentity = {
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

export type GovernedFeeLine = {
  amountAtomic: string;
  mint: string;
};

export type GovernedFeeSummary = {
  summary: string;
  platformFee: GovernedFeeLine | null;
  routeFees: GovernedFeeLine[];
  networkFeeStatus: string | null;
  networkFeeLamports: string | null;
};

export type GovernedActionViewModel = {
  namespace: string | null;
  operation: GovernedActionOperation;
  stage: GovernedActionStage;
  stageLabel: string;
  headline: string;
  supporting: string;
  action: 'buy' | 'sell' | 'send' | 'unknown';
  rawStatus: string;
  needsStatusCheck: boolean;
  intentId: string | null;
  attemptId: string | null;
  requestId: string | null;
  destinationOwner: string | null;
  protocolId: string | null;
  createdAt: string | null;
  lastActivityAt: string | null;
  product: GovernedAssetIdentity;
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
  amountDisplay: string | null;
  amountUnit: string | null;
  slippageBps: number | null;
  priceImpactBps: number | null;
  quoteExpiresAtUnixMs: number | null;
  fees: GovernedFeeSummary | null;
  transactionSignature: string | null;
  solscanUrl: string | null;
  confirmationCommitment: 'confirmed' | 'finalized' | null;
  executionSucceeded: boolean | null;
  finalizedEvidence: boolean;
  accountDeltaObserved: boolean | null;
  accountDeltaMatchesExpected: boolean | null;
  actor: 'agent' | 'owner' | 'unknown';
  grantId: string | null;
  grantRevision: number | null;
  grantRuleId: string | null;
  authorityExpiresAt: string | null;
  policyDecision: 'allowed' | 'approval_required' | null;
  ownerDecision: 'not-required' | 'pending' | 'approved' | 'refused' | null;
  approvalRequired: boolean;
  approvalReasons: string[];
  submitted: boolean | null;
  signed: boolean | null;
  landingProof: boolean | null;
  definitiveNonlandingProof: boolean;
  settlementFinalized: boolean | null;
  reconciliationRequired: boolean;
  canReconcile: boolean;
  reconcileOutcome: string | null;
  reconcilePhase: string | null;
  reconcileMutated: boolean | null;
  receiptPhases: string[];
  statusReadSafe: boolean | null;
  reconcileSameAttemptOnly: boolean | null;
  executeFromStatusForbidden: boolean | null;
  evidenceDigest: string | null;
  reconciliationEvidenceDigest: string | null;
  recovery: {
    kind: 'none' | 'read' | 'reconcile' | 'same-request' | 'manual';
    sentence: string | null;
  };
  refusalCode: string | null;
  explanation: string | null;
};

export type GovernedHistoryViewModel = {
  namespace: 'dexter-governed-transaction-history/v1';
  items: GovernedActionViewModel[];
  nextCursor: string | null;
  hasMore: boolean;
  omittedItems: number;
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringValue(item))
    .filter((item): item is string => item !== null);
}

function operationOf(root: UnknownRecord, input: UnknownRecord | null): GovernedActionOperation {
  const explicit = firstString(root.operation)?.toLowerCase();
  if (
    explicit === 'prepare'
    || explicit === 'execute'
    || explicit === 'status'
    || explicit === 'reconcile'
  ) return explicit;

  const namespace = firstString(root.namespace);
  if (namespace === 'dexter-governed-agent-action/v1') return 'prepare';
  if (namespace === 'dexter-governed-agent-execute/v1') return 'execute';
  if (namespace === 'dexter-governed-transaction-status/v1') return 'status';
  if (namespace === 'dexter-governed-agent-reconcile/v1') return 'reconcile';

  if (input?.operationId !== undefined && input?.intentId !== undefined) return 'execute';
  if (input?.action !== undefined) return 'prepare';
  return 'unknown';
}

function actorOf(...values: unknown[]): GovernedActionViewModel['actor'] {
  const actor = firstString(...values)?.toLowerCase();
  return actor === 'agent' || actor === 'owner' ? actor : 'unknown';
}

function ownerDecisionOf(...values: unknown[]): GovernedActionViewModel['ownerDecision'] {
  const status = firstString(...values)?.toLowerCase();
  return status === 'not-required'
    || status === 'pending'
    || status === 'approved'
    || status === 'refused'
    ? status
    : null;
}

function policyDecisionOf(...values: unknown[]): GovernedActionViewModel['policyDecision'] {
  const decision = firstString(...values)?.toLowerCase();
  return decision === 'allowed' || decision === 'approval_required'
    ? decision
    : null;
}

function groupedInteger(value: string | null): string | null {
  if (!value || !INTEGER.test(value)) return null;
  return BigInt(value).toLocaleString('en-US');
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

function safeInteger(
  value: unknown,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): number | null {
  const parsed = safeNumber(value);
  return parsed !== null
    && Number.isSafeInteger(parsed)
    && parsed >= minimum
    && parsed <= maximum
    ? parsed
    : null;
}

function normalizeProduct(
  identity: UnknownRecord | null,
  preview: UnknownRecord | null,
  business: UnknownRecord | null,
  status: UnknownRecord,
): GovernedAssetIdentity {
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
    decimals: safeInteger(identity?.decimals, 0, 18),
    registryIdentityDigest: firstString(identity?.registryIdentityDigest),
  };
}

function feeLine(value: unknown): GovernedFeeLine | null {
  const candidate = record(value);
  if (!candidate) return null;
  const amountAtomic = integerString(candidate.amountAtomic);
  const mint = stringValue(candidate.mint);
  return amountAtomic && mint ? { amountAtomic, mint } : null;
}

function normalizeFees(value: UnknownRecord | null): GovernedFeeSummary | null {
  if (!value) return null;
  const summary = stringValue(value.summary);
  const networkFee = record(value.networkFee);
  if (!summary || !networkFee) return null;
  const routeFees = Array.isArray(value.routeFees)
    ? value.routeFees.map(feeLine).filter((item): item is GovernedFeeLine => item !== null)
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

function actionOf(...values: unknown[]): GovernedActionViewModel['action'] {
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

function exactGovernedAssetIdentity(product: UnknownRecord): boolean {
  return firstString(product.assetClass) === 'stock'
    && firstString(product.companyName) !== null
    && firstString(product.productName) !== null
    && firstString(product.providerName) !== null
    && firstString(product.legalIssuerName) !== null
    && exactStringAgreement(product.issuer, product.legalIssuerName)
    && firstString(product.registryIdentityDigest) !== null
    && safeInteger(product.decimals, 0, 18) !== null
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
  if (product === null || !exactGovernedAssetIdentity(product)) return false;
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

function productLabel(product: GovernedAssetIdentity): string {
  return firstString(
    product.companyName,
    product.productName,
    product.symbol,
    product.assetId,
  ) ?? 'asset';
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
}): GovernedActionStage {
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

function actionPhrase(input: {
  action: GovernedActionViewModel['action'];
  product: GovernedAssetIdentity;
  requestedShares: string | null;
  minimumShares: string | null;
  quotedSpend: string | null;
  amountDisplay: string | null;
  amountUnit: string | null;
  destinationOwner: string | null;
}): { imperative: string; completed: string; noun: string } {
  const product = productLabel(input.product);
  const shareTarget = displayQuantity(input.requestedShares ?? input.minimumShares);
  const amount = input.amountDisplay && input.amountUnit
    ? `${input.amountDisplay} ${input.amountUnit}`
    : input.amountDisplay;
  const amountAlreadyNamesAsset = input.amountUnit?.endsWith(' base units') === true;
  const destination = shortenSolanaIdentity(input.destinationOwner, 5);

  if (input.action === 'buy') {
    const target = shareTarget
      ? `${sharePhrase(input.requestedShares ?? input.minimumShares)} of ${product}`
      : input.quotedSpend
        ? `$${input.quotedSpend} of ${product}`
        : product;
    return {
      imperative: `Buy ${target}`,
      completed: `${target} bought`,
      noun: 'purchase',
    };
  }
  if (input.action === 'sell') {
    const target = amount
      ? amountAlreadyNamesAsset ? amount : `${amount} of ${product}`
      : product;
    return {
      imperative: `Sell ${target}`,
      completed: `${target} sold`,
      noun: 'sale',
    };
  }
  if (input.action === 'send') {
    const target = amount ?? product;
    const suffix = destination ? ` to ${destination}` : '';
    return {
      imperative: `Send ${target}${suffix}`,
      completed: `${target} sent${suffix}`,
      noun: 'transfer',
    };
  }
  return {
    imperative: 'Governed action',
    completed: 'Governed action confirmed',
    noun: 'action',
  };
}

function stageCopy(input: {
  stage: GovernedActionStage;
  operation: GovernedActionOperation;
  action: GovernedActionViewModel['action'];
  product: GovernedAssetIdentity;
  requestedShares: string | null;
  minimumShares: string | null;
  quotedSpend: string | null;
  amountDisplay: string | null;
  amountUnit: string | null;
  destinationOwner: string | null;
  rawStatus: string;
  commitment: 'confirmed' | 'finalized' | null;
  executionSucceeded: boolean | null;
  definitiveNonlandingProof: boolean;
}): Pick<GovernedActionViewModel, 'stageLabel' | 'headline' | 'supporting'> {
  const phrase = actionPhrase(input);

  if (input.stage === 'success') {
    return {
      stageLabel: input.commitment === 'finalized' ? 'Finalized' : 'Confirmed',
      headline: phrase.completed,
      supporting: 'Solana confirmed the transaction and Dexter recorded successful execution.',
    };
  }
  if (input.stage === 'failure') {
    return {
      stageLabel: input.rawStatus === 'refused' ? 'Stopped' : 'Failed',
      headline: `${phrase.imperative} stopped before completion`,
      supporting: input.definitiveNonlandingProof
        ? 'Dexter proved that this transaction did not land.'
        : 'Dexter recorded no successful execution for this action.',
    };
  }
  if (input.stage === 'prepared') {
    return {
      stageLabel: 'Prepared',
      headline: phrase.imperative,
      supporting: 'This exact action is prepared. Nothing has been signed or submitted.',
    };
  }
  if (input.commitment !== null && input.executionSucceeded !== true) {
    return {
      stageLabel: 'Verifying',
      headline: `${phrase.imperative} is being verified`,
      supporting: 'Solana confirmation is present. Dexter has not yet proven successful execution.',
    };
  }
  if (['uncertain', 'ambiguous', 'reconciliation-required', 'unknown'].includes(input.rawStatus)) {
    return {
      stageLabel: 'Outcome unknown',
      headline: `Outcome unknown for ${phrase.noun}`,
      supporting: input.operation === 'prepare'
        ? 'Retry only the same request with the same operation ID.'
        : 'Keep this intent and inspect its durable status before any further action.',
    };
  }
  if (input.rawStatus === 'signed') {
    return {
      stageLabel: 'Signed',
      headline: `${phrase.imperative} is signed`,
      supporting: 'The signed transaction has not been proven submitted or confirmed.',
    };
  }
  return {
    stageLabel: 'Pending',
    headline: `${phrase.imperative} is awaiting confirmation`,
    supporting: 'Keep this intent and read its durable status before taking another action.',
  };
}

function recoveryFor(input: {
  stage: GovernedActionStage;
  operation: GovernedActionOperation;
  rawStatus: string;
  retry: string | null;
  retryable: boolean | null;
  intentId: string | null;
  reconciliationRequired: boolean;
  canReconcile: boolean;
  definitiveNonlandingProof: boolean;
  reconcileOutcome: string | null;
}): GovernedActionViewModel['recovery'] {
  if (input.stage === 'success' || input.definitiveNonlandingProof) {
    return { kind: 'none', sentence: null };
  }

  if (input.retry === 'same_operation_only' || input.retryable === true || (
    input.operation === 'prepare'
    && ['uncertain', 'unknown'].includes(input.rawStatus)
  )) {
    return {
      kind: 'same-request',
      sentence: 'Retry only the same request with the same operation ID.',
    };
  }

  if (input.retry === 'reconcile_same_intent_only') {
    return {
      kind: 'reconcile',
      sentence: 'Do not execute again. Inspect and reconcile this same intent only.',
    };
  }

  if (input.retry === 'manual_same_intent_only') {
    return {
      kind: 'manual',
      sentence: 'Do not retry automatically. Inspect this same intent before any manual reconciliation.',
    };
  }

  if (
    input.operation === 'reconcile'
    && ['pending', 'unavailable'].includes(input.reconcileOutcome ?? '')
  ) {
    return {
      kind: 'manual',
      sentence: 'Do not retry reconciliation automatically. Inspect this same intent first.',
    };
  }

  if (
    input.intentId
    && (
      input.rawStatus === 'reconciliation-required'
      || input.rawStatus === 'ambiguous'
      || (input.reconciliationRequired && input.canReconcile)
    )
  ) {
    return {
      kind: 'reconcile',
      sentence: 'Do not execute again. Reconcile this same intent and attempt only.',
    };
  }

  if (input.retry === 'read_again' || (input.intentId && input.stage === 'pending')) {
    return {
      kind: 'read',
      sentence: 'Do not execute again. Read this same intent before taking another action.',
    };
  }

  return { kind: 'none', sentence: null };
}

/**
 * Build the human result card from any of the prepare, execute, status, or
 * reconcile governed-action envelopes. The success predicate is deliberately
 * narrow: exact Solana signature + confirmed-or-finalized commitment +
 * executionSucceeded=true. Finalization is optional evidence, never a gate.
 */
export function normalizeGovernedAction(
  payload: unknown,
  toolInput: unknown = null,
): GovernedActionViewModel | null {
  const root = record(payload);
  if (!root) return null;
  const input = record(toolInput);
  const namespace = firstString(root.namespace);
  if (namespace === 'dexter-governed-transaction-history/v1') return null;
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
  const destinationOwner = firstString(
    preview?.destinationOwner,
    status.destinationOwner,
    business?.destinationOwner,
    root.destinationOwner,
    input?.destinationOwner,
  );
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
  const classifiedStage = classifyStage({
    rawStatus,
    signature,
    commitment,
    executionSucceeded,
    programError,
    definitiveNonlandingProof,
    identityExact,
  });
  const localFailure = namespace === 'opendexter-governed-backend-failure/v1';
  const stage = localFailure
    ? operation === 'execute' || operation === 'reconcile'
      ? 'pending'
      : 'failure'
    : classifiedStage;
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
  const inputAssetAmount = action === 'buy' || product.decimals === null
    ? null
    : formatAtomicDecimal(quotedInputAtomic, product.decimals, product.decimals);
  const amountDisplay = action === 'buy'
    ? quotedSpend
    : inputAssetAmount ?? groupedInteger(quotedInputAtomic);
  const selectedAssetLabel = firstString(product.symbol, product.assetId) ?? 'asset';
  const amountUnit = action === 'buy'
    ? 'USDC'
    : product.decimals === null
      ? `${selectedAssetLabel} base units`
      : selectedAssetLabel;
  const outputDecimals = action === 'buy'
    ? product.decimals
    : action === 'sell'
      ? 6
      : null;
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
    definitiveNonlandingProof,
  });
  const delta = firstRecord(
    status.accountDeltaEvidence,
    business?.accountDeltaEvidence,
    root.accountDeltaEvidence,
  );
  const intentId = firstString(status.intentId, root.intentId);
  const reconciliationRequired = firstBoolean(
    status.reconciliationRequired,
    business?.reconciliation && record(business.reconciliation)?.required,
    root.reconciliationRequired,
  ) === true;
  const canReconcile = firstBoolean(
    status.canReconcile,
    business?.reconciliation && record(business.reconciliation)?.availableToOwner,
    root.canReconcile,
  ) === true;
  const needsStatusCheck = stage === 'pending' && (
    ['uncertain', 'ambiguous', 'reconciliation-required', 'unknown'].includes(rawStatus)
    || commitment !== null
    || intentId !== null
  );
  const approvalStatus = firstString(approval?.status)?.toLowerCase();
  const ownerDecision = ownerDecisionOf(ownerDecisionRecord?.status)
    ?? (approvalStatus === 'owner-approval-required'
      ? 'pending'
      : approvalStatus === 'not-required'
        ? 'not-required'
        : null);
  const policyDecision = policyDecisionOf(status.policyDecision, root.policyDecision);
  const approvalReasons = Array.from(new Set([
    ...stringArray(approval?.reasons),
    ...stringArray(status.escalationReasons),
    ...stringArray(business?.refusalOrEscalationReasons),
  ]));
  const approvalRequired = approvalStatus === 'owner-approval-required'
    || firstBoolean(ownerDecisionRecord?.required) === true
    || policyDecision === 'approval_required';
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
    reconcileOutcome: operation === 'reconcile' ? firstString(root.outcome) : null,
  });

  if (
    action === 'unknown'
    && !product.assetId
    && !intentId
    && !preview
    && rawStatus === 'unknown'
    && !firstString(root.explanation)
  ) {
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
    inputAssetAmount,
    expectedOutput: outputDecimals === null
      ? null
      : formatAtomicDecimal(expectedOutputAtomic, outputDecimals, outputDecimals),
    minimumOutput: outputDecimals === null
      ? null
      : formatAtomicDecimal(minimumOutputAtomic, outputDecimals, outputDecimals),
    requestedMaximumSpend: formatAtomicDecimal(requestedMaximumSpendAtomic, 6, 6),
    amountDisplay,
    amountUnit,
    slippageBps: safeInteger(preview?.slippageBps, 0, 10_000),
    priceImpactBps: safeInteger(preview?.priceImpactBps, 0, 10_000),
    quoteExpiresAtUnixMs: safeInteger(preview?.quoteExpiresAtUnixMs, 0),
    fees: normalizeFees(feeSummary),
    transactionSignature: signature,
    solscanUrl: signature ? `https://solscan.io/tx/${signature}` : null,
    confirmationCommitment: commitment,
    executionSucceeded,
    finalizedEvidence: commitment === 'finalized',
    accountDeltaObserved: firstBoolean(delta?.observed),
    accountDeltaMatchesExpected: firstBoolean(delta?.matchesExpected),
    actor: actorOf(status.actor, attribution?.actor, root.actor),
    grantId: firstString(status.grantId, grant?.id, root.grantId),
    grantRevision: safeInteger(
      status.grantRevision ?? grant?.revision ?? root.grantRevision,
      0,
    ),
    grantRuleId: firstString(status.grantRuleId, grant?.ruleId, root.grantRuleId),
    authorityExpiresAt: firstString(
      status.authorityExpiresAt,
      grant?.expiresAt,
      root.authorityExpiresAt,
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
      root.settlementFinalized,
    ),
    reconciliationRequired,
    canReconcile,
    reconcileOutcome: operation === 'reconcile' ? firstString(root.outcome) : null,
    reconcilePhase: operation === 'reconcile' ? firstString(root.phase) : null,
    reconcileMutated: operation === 'reconcile' ? firstBoolean(root.mutated) : null,
    receiptPhases: stringArray(status.receiptPhases),
    statusReadSafe: firstBoolean(replay?.statusReadSafe),
    reconcileSameAttemptOnly: firstBoolean(replay?.reconcileSameAttemptOnly),
    executeFromStatusForbidden: firstBoolean(replay?.executeFromStatusForbidden),
    evidenceDigest: firstString(root.evidenceDigest, status.evidenceDigest),
    reconciliationEvidenceDigest: firstString(
      status.reconciliationEvidenceDigest,
      root.reconciliationEvidenceDigest,
      root.digest,
    ),
    recovery,
    refusalCode: firstString(
      status.refusalCode,
      root.refusalCode,
      root.code,
      business?.refusalCode,
    ),
    explanation: firstString(root.explanation, status.explanation, business?.explanation),
  };
}

export function normalizeGovernedHistory(payload: unknown): GovernedHistoryViewModel | null {
  const root = record(payload);
  if (
    root?.namespace !== 'dexter-governed-transaction-history/v1'
    || !Array.isArray(root.items)
  ) return null;

  const items = root.items
    .map((item) => normalizeGovernedAction(item))
    .filter((item): item is GovernedActionViewModel => item !== null);
  const nextCursor = stringValue(root.nextCursor);
  return {
    namespace: 'dexter-governed-transaction-history/v1',
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    omittedItems: root.items.length - items.length,
  };
}

export function displayShareQuantity(value: string | null): string | null {
  return displayQuantity(value);
}

export function shortenSolanaIdentity(value: string | null, size = 5): string | null {
  if (!value) return null;
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}...${value.slice(-size)}`;
}
