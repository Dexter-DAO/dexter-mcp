// Model-facing completion uses only fields already projected by the API.
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

export function readablePurchaseAmount(value) {
  if (!value || typeof value.amountAtomic !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value.amountAtomic)) return undefined;
  const knownUsdc = (['solana:mainnet', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'].includes(value.network) && value.asset === SOLANA_USDC)
    || (value.network === 'eip155:8453' && typeof value.asset === 'string' && value.asset.toLowerCase() === BASE_USDC);
  // Current supported purchases settle in these USDC assets. Unknown asset
  // precision stays unavailable rather than assuming six decimals for it.
  if (!knownUsdc) return undefined;
  if (value.decimals !== undefined && value.decimals !== 6) return undefined;
  const padded = value.amountAtomic.padStart(7, '0');
  const fraction = padded.slice(-6).replace(/0+$/, '');
  return {
    amountAtomic: value.amountAtomic, asset: value.asset, network: value.network,
    decimals: 6, symbol: 'USDC',
    displayAmount: `${padded.slice(0, -6)}${fraction ? `.${fraction}` : ''}`,
  };
}

export function purchaseResultGuidance(result) {
  const delivery = result.delivery;
  const payment = result.payment;
  const resultAvailable = delivery?.state === 'response_received'
    && delivery.toolError !== true
    && ((delivery.transport === 'mcp' && delivery.toolError === false && delivery.httpStatus == null)
      || (Number.isInteger(delivery.httpStatus) && delivery.httpStatus >= 200 && delivery.httpStatus < 300))
    && Object.hasOwn(delivery, 'result') && delivery.result !== null;
  const deliveryFailed = delivery?.toolError === true
    || (delivery?.state === 'response_received' && Number(delivery.httpStatus) >= 400)
    || delivery?.state === 'response_unsupported';
  const paymentConfirmed = payment?.confirmed === true && ['confirmed', 'settled'].includes(payment.state);
  const paymentFailed = payment?.state === 'failed_final';
  const commitment = ['confirmed', 'finalized'].includes(payment?.commitment) ? payment.commitment : null;
  const amount = readablePurchaseAmount(payment);
  const outcome = {
    resultAvailable,
    delivery: resultAvailable ? 'received' : deliveryFailed ? 'failed'
      : delivery?.state === 'not_dispatched' ? 'not_started' : 'unknown',
    payment: paymentConfirmed ? 'confirmed' : paymentFailed ? 'failed'
      : payment?.state === 'not_built' ? 'not_started'
        : ['signed', 'pending', 'settlement_pending', 'crystallized'].includes(payment?.state) ? 'pending' : 'unknown',
    commitment,
    ...(resultAvailable ? { resultPath: 'delivery.result' } : {}),
    ...(amount ? { amount: { ...amount, basis: paymentConfirmed ? 'confirmed_payment' : 'requested_payment' } } : {}),
    ...(typeof result.intentId === 'string' ? { purchaseReference: result.intentId } : {}),
  };
  const status = typeof result.intentId === 'string'
    ? { tool: 'x402_status', arguments: { intentId: result.intentId } } : {};
  const timing = Number.isSafeInteger(result.retryAfterMs) && result.retryAfterMs >= 0 ? { retryAfterMs: result.retryAfterMs } : {};
  let continuation;
  if (resultAvailable) {
    const observe = !paymentConfirmed && !paymentFailed;
    continuation = {
      action: observe ? 'deliver_result_and_observe' : 'deliver_result',
      ...(observe ? status : {}), ...timing,
      message: observe
        ? 'Use delivery.result to finish the requested task now. Check payment status on this same intent while confirmation is pending.'
        : 'Use delivery.result to finish the requested task and report the recorded payment outcome.',
    };
  } else if (result.authorizationRequired === true || result.status === 'authorization_required' || result.consentUrl || ['approval_required', 'authorization_required'].includes(result.error)) {
    continuation = {
      action: 'complete_authorization',
      ...(result.consentUrl ? { url: result.consentUrl } : {}),
      ...(result.retry ? { resume: result.retry } : {}),
      message: result.consentUrl
        ? 'Open the permission link for the missing authority, then continue the original task with this same intent.'
        : 'The wallet permission needed for this task is missing. Keep this intent while the connection is restored.',
    };
  } else if (deliveryFailed) {
    continuation = {
      action: paymentConfirmed || paymentFailed ? 'report_provider_error' : 'inspect_same_intent',
      ...(!paymentConfirmed && !paymentFailed ? status : {}), ...timing,
      message: 'Report the provider error and the recorded payment state. Keep this purchase identity for any status check.',
    };
  } else if (result.error === 'new_check_required' || result.status === 'check_expired') {
    continuation = {
      action: 'review_expired_check',
      message: 'This check is no longer executable. Preserve the original task and inspect the existing intent before deciding whether a replacement is appropriate.',
      ...status,
    };
  } else {
    continuation = {
      action: status.tool ? 'inspect_same_intent' : 'unavailable', ...status, ...timing,
      message: status.tool
        ? 'Inspect this same intent for the outcome. Keep the original request while its result is unresolved.'
        : 'The result is incomplete and no purchase status handle is available.',
    };
  }
  return { outcome, continuation };
}
