import { Lockup } from './Lockup';

/**
 * Compact, honest, non-custodial states (set up / activate / reach-error).
 * Same paper widget + lockup as the home, one message, and an optional CTA.
 * Native OAuth handoffs deliberately have no second button competing with the
 * host's Connect control.
 */
export function SimpleState({ title, body, cta, href, onOpenExternal }: {
  title: string;
  body: string;
  cta?: string;
  href?: string;
  onOpenExternal?: (url: string) => void;
}) {
  return (
    <div className="dxw-widget">
      <div className="dxw-head">
        <Lockup />
        <span className="dxw-custody">Held by your passkey</span>
      </div>
      <div className="dxw-simple">
        <div className="dxw-simple-title">{title}</div>
        <div className="dxw-simple-body">{body}</div>
        {cta && href && onOpenExternal ? (
          <button className="dxw-cta" onClick={() => onOpenExternal(href)} type="button">{cta}</button>
        ) : null}
      </div>
    </div>
  );
}
