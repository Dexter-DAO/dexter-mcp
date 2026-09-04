interface Props {
  description: string | null;
}

export function ResourceDescription({ description }: Props) {
  const concise = description?.trim();
  if (!concise) return null;
  const visible = concise.length <= 320
    ? concise
    : `${concise.slice(0, 319).trimEnd()}…`;
  return <p className="dx-pricing__description">{visible}</p>;
}
