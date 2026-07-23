import type { ReactNode } from 'react';
import { CloseIcon } from './icons';

/**
 * Bottom-sheet chrome shared by every wallet sheet: scrim + rise animation +
 * grabber + title + close. Only one sheet is ever mounted at a time (WalletHome
 * owns that state), which is what keeps the surface calm.
 */
export function Sheet({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="dxw-scrim" onClick={onClose} />
      <div className="dxw-sheet" role="dialog" aria-label={title}>
        <div className="dxw-grabber" />
        <button className="dxw-sheet-close" onClick={onClose} aria-label="Close" type="button">
          <CloseIcon />
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </>
  );
}
