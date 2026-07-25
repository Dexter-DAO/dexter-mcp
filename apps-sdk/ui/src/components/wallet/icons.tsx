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
export const AssetsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6.25 10 3l7 3.25-7 3.25L3 6.25Z" />
    <path d="m3 10.1 7 3.25 7-3.25M3 13.85l7 3.25 7-3.25" />
  </svg>
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

/** The World (World ID) globe mark — official chain asset, inlined so the
 *  frozen widget CSP never needs an image host. Renders in currentColor. */
export const WorldMark = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path fill="currentColor" d="M16.5125 4.20334C15.1337 3.40111 13.6295 3 12 3C10.3705 3 8.86629 3.40111 7.48746 4.20334C6.10863 5.00557 5.00557 6.10863 4.20334 7.48746C3.40111 8.86629 3 10.3705 3 12C3 13.6295 3.40111 15.1337 4.20334 16.5125C5.00557 17.8914 6.10863 18.9944 7.48746 19.7967C8.86629 20.5989 10.3705 21 12 21C13.6295 21 15.1337 20.5989 16.5125 19.7967C17.8914 18.9944 18.9944 17.8914 19.7967 16.5125C20.5989 15.1337 21 13.6295 21 12C21 10.3705 20.5989 8.86629 19.7967 7.48746C18.9944 6.10863 17.8914 5.00557 16.5125 4.20334ZM12.5515 15.2591C11.5237 15.2591 10.7214 14.9582 10.0947 14.3816C9.66852 13.9805 9.39276 13.5042 9.26741 12.9276H18.9944C18.8941 13.7549 18.6435 14.532 18.2925 15.2591H12.5766H12.5515ZM9.26741 11.0975C9.39276 10.546 9.66852 10.0446 10.0947 9.64345C10.7214 9.06685 11.5237 8.76602 12.5515 8.76602H18.2925C18.6685 9.49304 18.8941 10.2702 18.9944 11.0975H9.26741ZM5.90808 8.41504C6.53482 7.33705 7.38719 6.45961 8.46518 5.83287C9.54317 5.20613 10.7214 4.88022 12.0251 4.88022C13.3287 4.88022 14.507 5.20613 15.585 5.83287C16.1365 6.15877 16.6128 6.53482 17.0641 6.98607H12.5265C11.4986 6.98607 10.571 7.2117 9.7688 7.63788C8.96657 8.06407 8.33983 8.66574 7.91365 9.41783C7.61281 9.94429 7.41226 10.5209 7.31198 11.1226H5.08078C5.18106 10.1699 5.48189 9.26741 5.95822 8.44011L5.90808 8.41504ZM15.5599 18.1671C14.4819 18.7939 13.3036 19.1198 12 19.1198C10.6964 19.1198 9.51811 18.7939 8.44011 18.1671C7.36212 17.5404 6.50975 16.663 5.88301 15.585C5.40669 14.7577 5.10585 13.8802 5.00557 12.9276H7.23677C7.33705 13.5292 7.5376 14.1058 7.83844 14.6323C8.28969 15.3844 8.91643 15.961 9.69359 16.4123C10.4958 16.8384 11.4234 17.0641 12.4513 17.0641H16.9638C16.5376 17.4902 16.0613 17.8663 15.5348 18.1671H15.5599Z" />
  </svg>
);

/** Quiet credit chit mark for the open-a-line invite. */
export const CreditMark = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 8v8M8.5 12h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
