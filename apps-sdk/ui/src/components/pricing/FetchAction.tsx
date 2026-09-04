interface Props {
  intentReady: boolean;
  disabled?: boolean;
  status?: 'idle' | 'sending' | 'sent' | 'error';
  onFetch: () => void;
}

export function FetchAction({
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
      aria-busy={status === 'sending'}
      onClick={onFetch}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
