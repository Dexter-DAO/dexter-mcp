import { Button } from '@openai/apps-sdk-ui/components/Button';

interface Props {
  price: string | null;
  requestBound: boolean;
  disabled?: boolean;
  status?: 'idle' | 'sending' | 'sent' | 'error';
  onFetch: () => void;
}

export function FetchAction({
  price,
  requestBound,
  disabled = false,
  status = 'idle',
  onFetch,
}: Props) {
  const label =
    status === 'sending'
      ? 'Opening review…'
      : status === 'sent'
        ? 'Review opened in chat'
        : requestBound
          ? 'Review payment'
          : 'Review request';
  return (
    <Button color="primary" block onClick={onFetch} disabled={disabled}>
      {label}
      {price && status !== 'sent' ? ` · ${price}` : ''}
    </Button>
  );
}
