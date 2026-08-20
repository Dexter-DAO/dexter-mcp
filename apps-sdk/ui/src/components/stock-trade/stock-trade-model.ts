export type StockTradeStage = 'prepared' | 'pending' | 'success' | 'failure';

export type StockProductIdentity = {
  assetId: string | null;
  assetClass: string | null;
  companyName: string | null;
  productName: string | null;
  symbol: string | null;
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
  requestedShareQuantity: string | null;
  expectedShareQuantity: string | null;
  minimumShareQuantity: string | null;
  shareQuantityUnit: string | null;
  shareQuantitySemantics: string | null;
  overfillPossible: boolean;
  quotedInputAtomic: string | null;
  requestedMaximumSpendAtomic: string | null;
  quotedSpend: string | null;
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

const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;
const INTEGER = /^(0|[1-9][0-9]*)$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

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
  return signature && SOLANA_SIGNATURE.test(signature) ? signature : null;
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
}): StockTradeStage {
  // This is the complete success predicate. No lifecycle label, account-delta
  // receipt, or finalized commitment may add another user-visible gate.
  if (
    input.signature !== null
    && input.commitment !== null
    && input.executionSucceeded === true
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
  rawStatus: string;
  commitment: 'confirmed' | 'finalized' | null;
  executionSucceeded: boolean | null;
}): Pick<StockTradeViewModel, 'stageLabel' | 'headline' | 'supporting'> {
  const product = productLabel(input.product);
  const action = input.action === 'unknown' ? 'trade' : input.action;
  const target = sharePhrase(input.requestedShares ?? input.minimumShares);

  if (input.stage === 'success') {
    return {
      stageLabel: 'Confirmed',
      headline: input.action === 'buy'
        ? `${product} purchase confirmed`
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
    return {
      stageLabel: 'Preview',
      headline: input.action === 'buy'
        ? `Buy ${target} of ${product}`
        : `${action[0]?.toUpperCase() ?? ''}${action.slice(1)} ${product}`,
      supporting: 'Review the exact Solana product and quote. This is prepared, not yet bought.',
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
  const share = firstRecord(
    preview?.shareQuantity,
    status.shareQuantity,
    business?.shareQuantity,
    root.shareQuantity,
  );
  const productIdentity = firstRecord(
    preview?.productIdentity,
    status.productIdentity,
    business?.productIdentity,
    root.productIdentity,
  );
  const feeSummary = firstRecord(
    preview?.feeSummary,
    status.feeSummary,
    business?.feeSummary,
    root.feeSummary,
  );

  const action = actionOf(preview?.action, status.action, business?.action, root.action, input?.action);
  const product = normalizeProduct(productIdentity, preview, business, status);
  const requestedShares = firstDecimal(
    preview?.requestedShareQuantity,
    share?.requestedShareQuantity,
    status.requestedShareQuantity,
    root.requestedShareQuantity,
    input?.shareQuantity,
  );
  const expectedShares = firstDecimal(
    preview?.expectedShareQuantity,
    share?.expectedShareQuantity,
    status.expectedShareQuantity,
    root.expectedShareQuantity,
  );
  const minimumShares = firstDecimal(
    preview?.minimumShareQuantity,
    share?.minimumShareQuantity,
    status.minimumShareQuantity,
    root.minimumShareQuantity,
  );
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
  const stage = classifyStage({
    rawStatus,
    signature,
    commitment,
    executionSucceeded,
    programError,
    definitiveNonlandingProof,
  });
  const copy = stageCopy({
    stage,
    action,
    product,
    requestedShares,
    minimumShares,
    rawStatus,
    commitment,
    executionSucceeded,
  });
  const quotedInputAtomic = firstInteger(
    preview?.maximumInputAmountAtomic,
    preview?.amountAtomic,
    business?.amountAtomic,
    status.amountAtomic,
  );
  const requestedMaximumSpendAtomic = firstInteger(
    preview?.requestedMaximumSpendAtomic,
    share?.requestedMaximumSpendAtomic,
    input?.maximumSpendAtomic,
  );
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
    requestedShareQuantity: requestedShares,
    expectedShareQuantity: expectedShares,
    minimumShareQuantity: minimumShares,
    shareQuantityUnit: firstString(
      preview?.shareQuantityUnit,
      share?.shareQuantityUnit,
      share?.unit,
    ),
    shareQuantitySemantics: firstString(
      preview?.shareQuantitySemantics,
      share?.shareQuantitySemantics,
      share?.semantics,
    ),
    overfillPossible: firstBoolean(preview?.overfillPossible, share?.overfillPossible) === true,
    quotedInputAtomic,
    requestedMaximumSpendAtomic,
    quotedSpend: action === 'buy'
      ? formatAtomicDecimal(quotedInputAtomic, 6, 6)
      : null,
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
