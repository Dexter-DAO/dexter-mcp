export function projectWalletResultForModel(result, baseMeta) {
  const {
    _sessionToken,
    _cardToken,
    _walletToken,
    _portfolio,
    ...publicResult
  } = result;
  const meta = { ...baseMeta };
  if (_sessionToken) meta.sessionToken = _sessionToken;
  if (_cardToken) meta.dexterCardToken = _cardToken;
  if (_walletToken) meta.dexterWalletToken = _walletToken;
  if (_portfolio) meta.dexterPortfolio = _portfolio;
  return { publicResult, meta };
}
