import { Lockup } from './Lockup';

/**
 * Compact, honest, non-custodial states (set up / activate / reach-error).
 * Same paper widget + lockup as the home, one message, and an optional CTA.
 * Native OAuth handoffs deliberately have no second button competing with the
 * host's Connect control.
 */
export function SimpleState({
  title,
  body,
  cta,
  href,
  onOpenExternal,
  announcement = 'status',
}: {
  title: string;
  body: string;
  cta?: string;
  href?: string;
  onOpenExternal?: (url: string) => void;
  announcement?: 'loading' | 'status' | 'error';
}) {
  const isError = announcement === 'error';
  return (
    <div className="dxw-widget">
      <div className="dxw-head">
        <Lockup />
        <span className="dxw-custody">Held by your passkey</span>
      </div>
      <section className="dxw-simple">
        <div
          role={isError ? 'alert' : 'status'}
          aria-live={isError ? 'assertive' : 'polite'}
          aria-atomic="true"
          aria-busy={announcement === 'loading' || undefined}
        >
          <h2 className="dxw-simple-title">{title}</h2>
          <div className="dxw-simple-body">{body}</div>
        </div>
        {cta && href && onOpenExternal ? (
          <button className="dxw-cta" onClick={() => onOpenExternal(href)} type="button">{cta}</button>
        ) : null}
      </section>
    </div>
  );
}
