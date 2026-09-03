import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons';

/**
 * Bottom-sheet chrome shared by every wallet sheet: scrim + rise animation +
 * title + close. Only one sheet is ever mounted at a time (WalletHome owns that
 * state), which is what keeps the surface calm.
 */
export function Sheet({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <>
      <button
        className="dxw-scrim"
        onClick={onClose}
        aria-label={`Close ${title}`}
        tabIndex={-1}
        type="button"
      />
      <div
        className="dxw-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="dxw-sheet-close"
          ref={closeRef}
          onClick={onClose}
          aria-label={`Close ${title}`}
          type="button"
        >
          <CloseIcon />
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </>
  );
}
