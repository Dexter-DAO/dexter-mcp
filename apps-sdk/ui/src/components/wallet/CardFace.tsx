import { CARD_THEMES, CARD_THEME_ORDER, type CardThemeId } from './cardThemes';
import { Chip, EyeIcon, FreezeIcon, NetworkMark } from './icons';

/**
 * The Dexter virtual card face — one of the three themes, masked by default.
 * "tap to reveal" is a hint here; the real reveal fetches numbers into the frame
 * via a single-use URL (never model-visible) — that plumbing lands with the card
 * reveal step. Freeze lives on the card. No card tools involved (board #94/#95).
 */
export function CardFace({ theme, last4, onTheme }: {
  theme: CardThemeId;
  last4: string;
  onTheme: (t: CardThemeId) => void;
}) {
  const t = CARD_THEMES[theme];
  return (
    <>
      <div className="dxw-card" style={{ background: t.background, color: t.ink }}>
        <div className="dxw-card-top">
          <span className="dxw-card-brand">DEXTER</span>
          <button className="dxw-freeze" style={{ color: t.ink }} type="button">
            <FreezeIcon /> Freeze
          </button>
        </div>
        <div className="dxw-chip"><Chip /></div>
        <div className="dxw-pan">
          <span>••••</span><span>••••</span><span>••••</span><span>{last4}</span>
          <button className="dxw-reveal" style={{ color: t.ink }} type="button">
            <EyeIcon /> tap to reveal
          </button>
        </div>
        <div className="dxw-card-bottom">
          <span className="dxw-holder">BRANCH MANAGER</span>
          <span className="dxw-exp">••/••</span>
          <NetworkMark network={t.network} color={t.ink} />
        </div>
      </div>
      <div className="dxw-card-status">
        <span>Active — pays straight from your balance</span>
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
