import type { PurchaseReceiptPresentation } from './purchase-receipt-model';

export function PurchaseReceiptSummary({
  receipt,
}: {
  receipt: PurchaseReceiptPresentation;
}) {
  return (
    <section
      className={`dx-purchase-receipt dx-purchase-receipt--${receipt.tone}`}
      aria-label="Purchase outcome"
    >
      <div className="dx-purchase-receipt__header">
        <div>
          <span>{receipt.modeLabel}</span>
          <h2>{receipt.title}</h2>
        </div>
      </div>
      <dl>
        {receipt.rows.map((row) => (
          <div key={`${row.label}:${row.value}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {receipt.retryNote ? (
        <p className="dx-purchase-receipt__retry">{receipt.retryNote}</p>
      ) : null}
      <p className="dx-purchase-receipt__reference">
        Prepared purchase {receipt.references.preparedId}
      </p>
    </section>
  );
}
