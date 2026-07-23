import { Lockup } from './Lockup';

/**
 * Compact, honest, non-custodial states (set up / activate / reach-error).
 * Same paper widget + lockup as the home, one message, one passkey CTA — never
 * custodial framing, never a fund-losing address.
 */
export function SimpleState({ title, body, cta, href, onOpenExternal }: {
  title: string;
  body: string;
  cta: string;
  href: string;
  onOpenExternal: (url: string) => void;
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
        <button className="dxw-cta" onClick={() => onOpenExternal(href)} type="button">{cta}</button>
      </div>
    </div>
  );
}
