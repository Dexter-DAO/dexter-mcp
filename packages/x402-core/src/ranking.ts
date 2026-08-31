export interface NormalizedRankingState {
  rankingMode?: 'full' | 'degraded';
  degradedMessage?: string;
}

const DEFAULT_DEGRADED_MESSAGE =
  'Search ranking used a reduced fallback. Treat the ordering as less precise.';

const UNKNOWN_RANKING_MODE_MESSAGE =
  'Ranking returned a mode this client cannot interpret. Treat these results as degraded.';

/**
 * Keep forward-compatible wire values inside the stable public contract.
 * A mode this client cannot interpret is conservatively exposed as degraded,
 * never as the normal full-ranking path.
 */
export function normalizeRankingState(
  rankingMode: unknown,
  degradedMessage: unknown,
): NormalizedRankingState {
  if (rankingMode === 'full') {
    return { rankingMode: 'full' };
  }

  if (rankingMode === 'degraded') {
    return {
      rankingMode: 'degraded',
      degradedMessage:
        typeof degradedMessage === 'string' && degradedMessage.trim()
          ? degradedMessage.trim()
          : DEFAULT_DEGRADED_MESSAGE,
    };
  }

  if (typeof rankingMode === 'string' && rankingMode.trim()) {
    return {
      rankingMode: 'degraded',
      degradedMessage:
        typeof degradedMessage === 'string' && degradedMessage.trim()
          ? degradedMessage.trim()
          : UNKNOWN_RANKING_MODE_MESSAGE,
    };
  }

  return {};
}
