const FAILURE_MESSAGES = Object.freeze({
  not_found: 'The latest catalog check could not find this endpoint.',
  auth_gated: 'The latest catalog check required provider authentication.',
  merchant_down: 'The provider was unavailable at the latest catalog check.',
});

export function isIndexterCurrentFailureReason(reason) {
  return typeof reason === 'string' && Object.hasOwn(FAILURE_MESSAGES, reason);
}

export function indexterCurrentFailureReason(source) {
  const reason = source?.execution?.unavailableReason;
  return source?.access?.checkable === false
    && source?.execution?.availability === 'catalog_only'
    && isIndexterCurrentFailureReason(reason) ? reason : null;
}

export function indexterCurrentFailureMessage(reason) {
  return isIndexterCurrentFailureReason(reason) ? FAILURE_MESSAGES[reason] : null;
}
