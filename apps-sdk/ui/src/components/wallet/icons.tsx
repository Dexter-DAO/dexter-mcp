/* Shared inline icons for the wallet widget. Stroke inherits `currentColor`. */

export const Chevron = ({ size = 14 }: { size?: number }) => (
  <svg className="dxw-chev" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg>
);

export const CloseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
);

export const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></svg>
);

export const EyeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="2" /></svg>
);

export const FreezeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="M8 1v14M2 4.5l12 7M14 4.5l-12 7" /></svg>
);

/** The gold EMV chip, pure SVG. */
export const Chip = () => (
  <svg width="44" height="32" viewBox="0 0 44 32" aria-hidden="true">
    <defs>
      <linearGradient id="dxw-chipg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ecd6a4" /><stop offset=".5" stopColor="#cfa964" /><stop offset="1" stopColor="#a37c3f" />
      </linearGradient>
    </defs>
    <rect x=".5" y=".5" width="43" height="31" rx="5.5" fill="url(#dxw-chipg)" stroke="rgba(70,50,18,.55)" />
    <path d="M14 .5v8.5a5 5 0 0 1-5 5H.5 M14 31.5v-8.5a5 5 0 0 0-5-5H.5 M30 .5v8.5a5 5 0 0 0 5 5h8.5 M30 31.5v-8.5a5 5 0 0 1 5-5h8.5 M14 16h16" stroke="rgba(70,50,18,.55)" fill="none" />
  </svg>
);

/** Card network mark — Visa wordmark or Mastercard circles. */
export const NetworkMark = ({ network, color }: { network: 'visa' | 'mastercard'; color: string }) => {
  if (network === 'mastercard') {
    return (
      <svg width="34" height="22" viewBox="0 0 34 22" aria-label="Mastercard">
        <circle cx="12" cy="11" r="10" fill="#EB001B" opacity=".9" />
        <circle cx="22" cy="11" r="10" fill="#F79E1B" opacity=".9" />
        <path d="M17 3.4a10 10 0 0 0 0 15.2 10 10 0 0 0 0-15.2z" fill="#FF5F00" />
      </svg>
    );
  }
  return <span className="dxw-visa" style={{ color }}>VISA</span>;
};

/* Home action-row glyphs. */
export const DepositIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3v9.2M10 12.2 6.6 8.8M10 12.2l3.4-3.4" /><path d="M3.5 13.8v1.7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1.7" /></svg>
);
export const CardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><rect x="2.5" y="4.5" width="15" height="11.5" rx="2" /><path d="M2.5 8.75h15" /></svg>
);
export const AgentsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M10 2.2l1.9 5.9L18 10l-6.1 1.9L10 17.8l-1.9-5.9L2 10l6.1-1.9z" /></svg>
);
export const ActivityIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5.5 2.5h9V17l-2.25-1.4L10 17l-2.25-1.4L5.5 17z" /><path d="M8 6.5h4M8 9.5h4" /></svg>
);

export const MoonPayMark = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="15" fill="#7D00FE" /><path d="M19.9 7.6a8.4 8.4 0 1 0 2.7 10.5 6.9 6.9 0 0 1-2.7-10.5z" fill="#fff" /></svg>
);
export const CoinbaseMark = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="15" fill="#0052FF" /><path d="M15 7.4a7.6 7.6 0 1 0 7.4 9.5h-4.1a3.7 3.7 0 1 1 0-3.8h4.1A7.6 7.6 0 0 0 15 7.4z" fill="#fff" /></svg>
);
