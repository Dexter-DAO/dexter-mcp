/**
 * ReceiptLoading — the state before the host supplies any tool result.
 *
 * Elapsed time is never evidence of dispatch, payment, settlement, delivery,
 * or finality. If the host never supplies a result, the animation terminates
 * in an accurate no-result error.
 */

import { useEffect, useState } from 'react';
import { DexterLoading } from '../loading/DexterLoading';
import {
  MISSING_TOOL_RESULT_TIMEOUT_SECONDS,
  receiptLoadingState,
} from './receipt-loading-model';

interface Props {
  resourceLabel?: string | null;
}

export function ReceiptLoading({ resourceLabel }: Props) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setElapsed(MISSING_TOOL_RESULT_TIMEOUT_SECONDS),
      MISSING_TOOL_RESULT_TIMEOUT_SECONDS * 1000,
    );
    return () => window.clearTimeout(timeout);
  }, []);
  const state = receiptLoadingState(elapsed);

  if (state.terminal) {
    return (
      <article className="dx-receipt">
        <div className="dx-receipt-error" role="alert">
          <span className="dx-receipt-error__eyebrow">Tool result missing</span>
          <p className="dx-receipt-error__message">{state.heading}</p>
          <p className="dx-receipt-error__code">{state.supporting}</p>
        </div>
      </article>
    );
  }

  return (
    <DexterLoading
      eyebrow="Dexter · Tool call"
      stages={[
        {
          upTo: Infinity,
          heading: state.heading,
          supporting: state.supporting,
        },
      ]}
      context={resourceLabel || null}
      contextLabel="endpoint"
    />
  );
}
