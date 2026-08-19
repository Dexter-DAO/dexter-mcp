export const MISSING_TOOL_RESULT_TIMEOUT_SECONDS = 18;

export type ReceiptLoadingState = Readonly<{
  terminal: boolean;
  heading: string;
  supporting: string;
}>;

export function receiptLoadingState(elapsedSeconds: number): ReceiptLoadingState {
  const elapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  if (elapsed >= MISSING_TOOL_RESULT_TIMEOUT_SECONDS) {
    return {
      terminal: true,
      heading: 'No tool result returned',
      supporting:
        'The call did not return backend evidence. Dispatch, payment, settlement, and delivery are not confirmed.',
    };
  }
  return {
    terminal: false,
    heading: 'Waiting for OpenDexter…',
    supporting:
      'The tool call has not returned. No dispatch, payment, settlement, or delivery is confirmed.',
  };
}
