import { readablePurchaseAmount } from './open-purchase-result.mjs';

const explanations = {
  execution_not_found: 'This connection could not retrieve the saved action. Its execution outcome is unknown to this connection.',
  stock_trading_setup_pending: 'Dexter is still preparing this connection for trading.',
  stock_prepare_dependency_unavailable: 'Dexter could not verify that its trading service is ready.',
  grant_revision_inactive: 'This connection needs trading permission.',
  jupiter_request_failed: 'The quote service did not return a usable trading route.',
  blockhash_expired_not_landed: 'The signed transaction expired without landing.',
};

function reference(body) {
  return {
    ...(body.intentId ? { intentId: body.intentId } : {}),
    ...(body.requestId ? { operationId: body.requestId } : {}),
    ...(body.transactionSignature ? { transactionSignature: body.transactionSignature } : {}),
  };
}

function actionPresentation(body) {
  const state = body.business ?? body;
  const receipt = body.receiptOutcome;
  const knownSuccess = state.executionSucceeded === true
    && (body.executed === true || body.landingProof === true)
    && ['confirmed', 'finalized'].includes(state.finality ?? body.confirmationCommitment);
  const result = { status: body.status ?? state.lifecycle ?? 'unknown', ...reference(body),
    ...(body.code ? { code: body.code } : {}),
    ...(typeof body.retryable === 'boolean' ? { retryable: body.retryable } : {}),
    ...(body.retryWithSameRequestOnly === true ? { retryWithSameRequestOnly: true } : {}),
    ...(Number.isSafeInteger(body.retryAfterMs) ? { retryAfterMs: body.retryAfterMs } : {}),
  };
  if (body.status === 'prepared' && body.preview && body.approval) {
    const covered = body.approval.status === 'not-required';
    const executeId = `execute:${body.intentId}`;
    return {
      ...result,
      summary: covered
        ? 'The action is ready to execute under the existing permission. The preview is estimated; nothing has executed.'
        : 'This prepared action needs owner approval before execution. The preview is estimated; nothing has executed.',
      approval: body.approval,
      effectiveExpiresAt: body.effectiveExpiresAt,
      preview: preparedPreview(body.preview),
      nextActions: covered
        ? [{ tool: 'dexter_execute_asset_action', arguments: {
          operationId: executeId === body.requestId ? `${executeId}:execute` : executeId, intentId: body.intentId,
        }, condition: 'The current task covers these exact prepared terms, and both effectiveExpiresAt and the quote expiry are still in the future.',
        reason: 'Continue the existing task without another approval question. Preserve this Execute operationId; inspect the same intent with Status after uncertainty.' }]
        : [{ action: 'review_wallet_permission', url: body.permissionRequest?.approvalUrl ?? 'https://dexter.cash/wallet',
          ...(body.permissionRequest?.expiresAt ? { expiresAt: body.permissionRequest.expiresAt } : {}),
          directApprovalLinkAvailable: Boolean(body.permissionRequest?.approvalUrl),
          reason: body.permissionRequest?.approvalUrl
            ? 'Complete the returned owner approval, then continue the original task and intent.'
            : 'Open Wallet to review this connection and the returned approval reasons. No direct approval link was returned. Keep the original task and intent; Execute cannot grant the missing permission.' }],
    };
  }
  if (knownSuccess) {
    result.summary = `${state.action === 'sell' ? 'Sale' : state.action === 'buy' ? 'Purchase' : 'Transfer'} ${(state.finality ?? body.confirmationCommitment) === 'finalized' ? 'finalized' : 'confirmed'}.`;
    if (receipt?.status === 'recorded') {
      result.actual = {
        debit: presentAmount(receipt.debit),
        credit: presentAmount(receipt.credit),
        observedAt: receipt.observedAt,
        receiptDigest: receipt.receiptDigest,
        fees: 'Verified fee amounts are unavailable.',
      };
      if (receipt.action === 'sell') result.summary += ` Received ${receipt.credit.displayAmount} ${receipt.credit.symbol}.`;
    } else {
      result.actual = { available: false, message: 'Actual fill amounts are unavailable. The saved quote remains an estimate.' };
    }
    result.nextActions = [
      ...((state.finality ?? body.confirmationCommitment) !== 'finalized'
        ? [observationStep(body)] : []),
      { tool: 'dexter_wallet_portfolio', arguments: {}, reason: 'Read current cash and affected holdings to finish the requested task.' },
    ];
    return result;
  }
  const code = body.code ?? body.refusalCode;
  result.summary = explanations[code] ?? body.explanation ?? (
    body.status === 'prepared' ? 'The action is prepared. It has not executed.'
      : state.executionSucceeded === false && (body.landingProof === true || state.settlement === 'landed') ? 'The transaction landed, but the action failed.'
        : 'The action has no verified successful result yet.'
  );
  if (body.permissionRequest?.approvalUrl) {
    result.nextActions = [{ action: 'open_approval', url: body.permissionRequest.approvalUrl,
      expiresAt: body.permissionRequest.expiresAt,
      reason: 'Grant the missing permission, then continue the original request.' }];
  } else if (code === 'execution_not_found') {
    result.nextActions = [{ action: 'inspect_original_connection',
      reason: 'Keep the original action identity. If it was created through another connection, read its Status there. This failed read does not establish that execution failed or authorize a replacement.' }];
  } else if (body.definitiveNonlandingProof === true) {
    result.nextActions = [{ action: 'report_not_executed', reason: 'This attempt is proven not to have landed. Keep its receipt; a replacement is a separate attempt within the original task.' }];
  } else if (body.intentId && body.status !== 'prepared') {
    result.nextActions = [observationStep(body)];
  } else if (body.status === 'prepared') {
    result.nextActions = [{ action: 'follow_prepare_decision',
      reason: 'Continue only if the current task and returned permission cover this prepared action. Another question is needed only for a missing consequential decision.' }];
  } else if (body.namespace === 'dexter-governed-agent-action/v1' && (body.retryable === true || body.retryWithSameRequestOnly === true)) {
    result.nextActions = [{ action: 'retry_same_preparation', operationId: body.requestId,
      reason: 'Continue this preparation with its original operationId and request terms. Preserve the task and wait for the returned retry delay when present.' }];
  } else {
    result.nextActions = [{ action: 'use_returned_recovery', reason: body.explanation ?? result.summary }];
  }
  return result;
}

function quoteAmount(amountAtomic, mint, product) {
  if (amountAtomic === undefined || amountAtomic === null) return null;
  const network = product.network === 'solana-mainnet' ? 'solana:mainnet' : product.network;
  const readable = readablePurchaseAmount({ amountAtomic, asset: mint, network });
  if (readable) return { amount: readable.displayAmount, symbol: readable.symbol, amountAtomic, mint, decimals: readable.decimals };
  return { amountAtomic, mint,
    ...(mint === product.mint ? { symbol: product.symbol, decimals: product.decimals, tokenProgram: product.tokenProgram } : {}),
    displayAmount: null,
    displayStatus: 'This quote provides raw units; a displayed share quantity is available only where explicitly returned below.',
  };
}

function preparedPreview(preview) {
  const product = preview.productIdentity;
  const terms = ['requestAmountKind', 'requestedShareQuantity', 'expectedShareQuantity', 'minimumShareQuantity',
    'shareQuantityUnit', 'shareQuantitySemantics', 'overfillPossible', 'slippageBps', 'priceImpactBps', 'destinationOwner'];
  return {
    basis: 'estimated_quote', action: preview.action, assetId: preview.assetId,
    product: { name: product.productName, companyName: product.companyName, symbol: product.symbol },
    input: quoteAmount(preview.amountAtomic, preview.inputMint, product),
    expectedOutput: quoteAmount(preview.expectedOutputAtomic, preview.outputMint, product),
    minimumOutput: quoteAmount(preview.minimumOutputAtomic, preview.outputMint, product),
    maximumInput: quoteAmount(preview.maximumInputAmountAtomic, preview.inputMint, product),
    requestedMaximumSpend: quoteAmount(preview.requestedMaximumSpendAtomic, preview.inputMint, product),
    ...Object.fromEntries(terms.filter((key) => Object.hasOwn(preview, key)).map((key) => [key, preview[key]])),
    quoteExpiresAtUnixMs: preview.quoteExpiresAtUnixMs,
    quotedFees: preview.feeSummary,
  };
}

function observationStep(body) {
  if (body.reconciliationRequired === true && body.canReconcile === true) {
    return { tool: 'dexter_reconcile_asset_action', arguments: { intentId: body.intentId },
      condition: 'The original task covers completing this same attempt. A status-only request does not authorize dispatch.',
      reason: 'The saved status requires recovery on this attempt. Recovery may submit its already-signed transaction; inspect status after uncertainty rather than repeating recovery.' };
  }
  return { tool: 'dexter_asset_action_status', arguments: { intentId: body.intentId },
    reason: 'Inspect this same request. Do not repeat Execute or create a replacement while its result is uncertain.' };
}

function presentAmount(amount) {
  return {
    symbol: amount.symbol,
    amount: amount.displayAmount,
    ...(amount.displayAmount === null ? {
      baseTokenAmount: amount.baseAmount,
      displayStatus: 'Historical display scaling is unavailable; this base-token quantity is not a verified share equivalent.',
    } : {}),
  };
}

export function presentGovernedAgentResult(body) {
  if (Array.isArray(body.items)) {
    return { items: body.items.map(actionPresentation), nextCursor: body.nextCursor };
  }
  if (body.statusAfter) {
    const presentation = actionPresentation(body.statusAfter);
    if (body.outcome === 'pending') {
      presentation.nextActions = [{ tool: 'dexter_asset_action_status', arguments: { intentId: body.intentId },
        reason: 'Recovery remains uncertain. Inspect this same attempt; do not automatically repeat Reconcile.' }];
    }
    return { ...presentation, recoveryOutcome: body.outcome,
      recoveryMessage: body.outcome === 'not-required' ? 'No recovery action was needed.' : body.explanation };
  }
  if (body.namespace === 'opendexter-governed-backend-failure/v1') {
    return { status: body.status, code: body.code, operationId: body.operationId, retry: body.retry,
      summary: body.explanation, intentId: body.intentId,
      nextActions: body.intentId
        ? [{ tool: 'dexter_asset_action_status', arguments: { intentId: body.intentId }, reason: 'Read this same request before any further action.' }]
        : [{ action: body.retry, operationId: body.operationId, reason: 'Preserve the original request and its returned recovery restrictions.' }] };
  }
  return actionPresentation(body);
}
