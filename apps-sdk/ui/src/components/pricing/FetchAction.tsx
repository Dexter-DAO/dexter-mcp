interface Props {
  price: string | null;
  intentReady: boolean;
  disabled?: boolean;
  status?: 'idle' | 'sending' | 'sent' | 'error';
  onFetch: () => void;
}

export function FetchAction({
  price,
  intentReady,
  disabled = false,
  status = 'idle',
  onFetch,
}: Props) {
  const label =
    status === 'sending'
      ? 'Opening review…'
      : status === 'sent'
        ? 'Opened in chat'
        : intentReady
          ? 'Review payment'
          : 'Complete request';
  return (
    <button
      type="button"
      className="dx-pricing__action"
      aria-label={label}
      onClick={onFetch}
      disabled={disabled}
    >
      <span>{label}</span>
      {price && status !== 'sent' ? (
        <span className="dx-pricing__action-price" aria-hidden>{price}</span>
      ) : null}
    </button>
  );
}
