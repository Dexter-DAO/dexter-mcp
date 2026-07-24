import { useEffect, useRef, useState } from 'react';
import type { WalletCard } from '../x402';
import { CARD_THEMES, CARD_THEME_ORDER, type CardThemeId } from './cardThemes';
import { Chip, EyeIcon, FreezeIcon, NetworkMark } from './icons';

// Widget-frame-only Dextercard rail on the hosted MCP origin. Auth is the
// short-TTL token from _meta.dexterCardToken — never model-visible. The
// reveal response's imageUrl is a SINGLE-USE same-origin URL streaming the
// carrier's PCI-safe render (PAN/CVV as pixels); numbers never exist as text
// anywhere in the widget, the tool result, or the chat.
const CARD_RAIL = 'https://open.dexter.cash/widget/card';
const CARD_SIGNUP_URL = 'https://dexter.cash/dextercard';
// The revealed image self-hides after this long — a card left open on a
// shared screen is the exact thing tap-to-reveal exists to prevent.
const REVEAL_HIDE_MS = 45_000;

type RevealState =
  | { kind: 'masked' }
  | { kind: 'loading' }
  | { kind: 'shown'; imageUrl: string }
  | { kind: 'error' };

/**
 * The Dexter virtual card face — one of the three themes.
 *
 * Three real states, driven by server data (board #94/#95 card-in-wallet):
 * - no card  → the face is a preview; tapping routes to the web signup.
 * - active   → masked PAN + tap-to-reveal (single-use image into the frame)
 *              + Freeze on the card.
 * - frozen   → frosted face + Unfreeze.
 */
export function CardFace({ theme, card, cardToken, onTheme, onOpenExternal }: {
  theme: CardThemeId;
  card: WalletCard;
  cardToken: string | null;
  onTheme: (t: CardThemeId) => void;
  onOpenExternal: (url: string) => void;
}) {
  const t = CARD_THEMES[theme];
  const hasCard = card.status !== 'none';
  // Freeze state starts from the server summary; freeze/unfreeze responses
  // update it from their own server-confirmed status (never optimistic).
  const [frozen, setFrozen] = useState(card.status === 'frozen');
  const [freezeBusy, setFreezeBusy] = useState(false);
  const [reveal, setReveal] = useState<RevealState>({ kind: 'masked' });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFrozen(card.status === 'frozen');
  }, [card.status]);
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const armed = hasCard && Boolean(cardToken);

  const hideReveal = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setReveal({ kind: 'masked' });
  };

  const onReveal = async () => {
    if (reveal.kind === 'shown') { hideReveal(); return; }
    if (!armed || reveal.kind === 'loading') return;
    setReveal({ kind: 'loading' });
    try {
      const res = await fetch(`${CARD_RAIL}/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cardToken }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok || typeof body.imageUrl !== 'string') throw new Error('reveal_failed');
      setReveal({ kind: 'shown', imageUrl: body.imageUrl });
      hideTimer.current = setTimeout(hideReveal, REVEAL_HIDE_MS);
    } catch {
      setReveal({ kind: 'error' });
    }
  };

  const onFreeze = async () => {
    if (!armed || freezeBusy) return;
    setFreezeBusy(true);
    try {
      const res = await fetch(`${CARD_RAIL}/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cardToken, action: frozen ? 'unfreeze' : 'freeze' }),
      });
      const body = await res.json();
      if (res.ok && body?.ok) {
        setFrozen(body.status === 'frozen');
        if (body.status === 'frozen') hideReveal();
      }
    } catch { /* status line keeps the last server-confirmed state */ }
    setFreezeBusy(false);
  };

  const statusLine = !hasCard
    ? 'No card yet — tap the card to get yours'
    : frozen
      ? 'Frozen — nothing can charge this card'
      : 'Active — pays straight from your balance';

  return (
    <>
      <div
        className={`dxw-card${frozen ? ' dxw-card-frozen' : ''}${!hasCard ? ' dxw-card-preview' : ''}`}
        style={{ background: t.background, color: t.ink }}
      >
        <div className="dxw-card-top">
          <span className="dxw-card-brand">DEXTER</span>
          {hasCard ? (
            <button
              className="dxw-freeze"
              style={{ color: t.ink }}
              onClick={onFreeze}
              disabled={!armed || freezeBusy}
              type="button"
            >
              <FreezeIcon /> {frozen ? 'Unfreeze' : 'Freeze'}
            </button>
          ) : null}
        </div>
        <div className="dxw-chip"><Chip /></div>
        {reveal.kind === 'shown' ? (
          <button className="dxw-pan dxw-pan-revealed" onClick={hideReveal} type="button" title="Tap to hide">
            <img className="dxw-reveal-img" src={reveal.imageUrl} alt="Card number, expiry and CVV" />
          </button>
        ) : (
          <div className="dxw-pan">
            <span>••••</span><span>••••</span><span>••••</span><span>{card.last4 ?? '••••'}</span>
            {hasCard ? (
              <button
                className="dxw-reveal"
                style={{ color: t.ink }}
                onClick={onReveal}
                disabled={!armed || frozen || reveal.kind === 'loading'}
                type="button"
              >
                <EyeIcon /> {reveal.kind === 'loading' ? 'revealing…' : reveal.kind === 'error' ? 'try again' : 'tap to reveal'}
              </button>
            ) : null}
          </div>
        )}
        <div className="dxw-card-bottom">
          <span className="dxw-holder">DEXTER WALLET</span>
          <span className="dxw-exp">{card.expiry ?? '••/••'}</span>
          <NetworkMark network={t.network} color={t.ink} />
        </div>
        {!hasCard ? (
          <button
            className="dxw-card-get"
            onClick={() => onOpenExternal(CARD_SIGNUP_URL)}
            type="button"
            aria-label="Get your Dexter card"
          />
        ) : null}
      </div>
      <div className="dxw-card-status">
        <span>{statusLine}</span>
        <span className="dxw-swatches">
          {CARD_THEME_ORDER.map((id) => (
            <button
              key={id}
              className={`dxw-swatch dxw-swatch-${id === 'moonagents' ? 'moon' : id}`}
              aria-pressed={theme === id}
              onClick={() => onTheme(id)}
              title={CARD_THEMES[id].label}
              type="button"
            />
          ))}
        </span>
      </div>
    </>
  );
}
