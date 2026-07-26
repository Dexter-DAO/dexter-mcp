import { Button } from '@openai/apps-sdk-ui/components/Button';

interface Props {
  selectedPrice: string | null;
  onFetch: () => void;
}

export function FetchAction({ selectedPrice, onFetch }: Props) {
  return (
    <Button color="primary" block onClick={onFetch}>
      Continue in chat{selectedPrice ? ` · ${selectedPrice}` : ''}
    </Button>
  );
}
