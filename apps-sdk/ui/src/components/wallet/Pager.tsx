export function Pager({
  label,
  page,
  pageCount,
  start,
  end,
  total,
  onPage,
}: {
  label: string;
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav className="dxw-pager" aria-label={label}>
      <span aria-live="polite">{`${start}\u2013${end} of ${total}`}</span>
      <span className="dxw-pager__actions">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPage(Math.max(0, page - 1))}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page === pageCount - 1}
          onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
        >
          Next
        </button>
      </span>
    </nav>
  );
}
