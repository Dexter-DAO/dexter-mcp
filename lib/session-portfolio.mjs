import { createHmac } from 'node:crypto';

export const SESSION_PORTFOLIO_SIGNATURE_PURPOSE = 'mcp-portfolio-v1';

export function signedSessionPortfolioHeaders(sessionId, secret, now = Date.now()) {
  if (!secret) return {};
  const timestamp = String(now);
  const signature = createHmac('sha256', secret)
    .update(
      `${timestamp}.${sessionId}.${SESSION_PORTFOLIO_SIGNATURE_PURPOSE}`,
    )
    .digest('hex');
  return {
    'x-internal-timestamp': timestamp,
    'x-internal-signature': signature,
  };
}

export async function fetchSessionPortfolio({
  apiBase,
  sessionId,
  expectedWalletAddress,
  secret,
  fetchImpl = fetch,
  timeoutMs = 8_000,
}) {
  if (!sessionId || !expectedWalletAddress || !secret) return null;

  try {
    const response = await fetchImpl(
      `${apiBase.replace(/\/+$/, '')}/api/passkey-anon/mcp-portfolio/${encodeURIComponent(sessionId)}`,
      {
        headers: signedSessionPortfolioHeaders(sessionId, secret),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!response.ok) return null;

    const body = await response.json().catch(() => null);
    const portfolio =
      body?.portfolio && typeof body.portfolio === 'object'
        ? body.portfolio
        : null;
    if (
      !portfolio ||
      typeof portfolio.walletAddress !== 'string' ||
      portfolio.walletAddress !== expectedWalletAddress
    ) {
      return null;
    }
    return portfolio;
  } catch {
    return null;
  }
}
