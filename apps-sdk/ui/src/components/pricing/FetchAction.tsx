import { Button } from '@openai/apps-sdk-ui/components/Button';

interface Props {
  selectedPrice: string | null;
  selectedMode: string | null;
  disabled?: boolean;
  status?: 'idle' | 'sending' | 'sent' | 'error';
  onFetch: () => void;
}

export function FetchAction({
  selectedPrice,
  selectedMode,
  disabled = false,
  status = 'idle',
  onFetch,
}: Props) {
  const label =
    status === 'sending'
      ? 'Opening review…'
      : status === 'sent'
        ? 'Review opened in chat'
        : selectedMode
          ? `Continue in chat · ${selectedMode}`
          : 'Choose a purchase mode';
  return (
    <Button color="primary" block onClick={onFetch} disabled={disabled}>
      {label}
      {selectedPrice && status !== 'sent' ? ` · ${selectedPrice}` : ''}
    </Button>
  );
}
