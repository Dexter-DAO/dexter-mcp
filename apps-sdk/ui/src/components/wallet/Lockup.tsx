import walletLockupDark from '../../assets/dexter-wallet-lockup-dark.svg?url';
import walletLockupLight from '../../assets/dexter-wallet-lockup-light.svg?url';
import '../../styles/components/wallet-lockup.css';

/*
 * Exact rescued Dexter Wallet masters from
 * dexter-thesis/assets/brand/dexter-wallet/. The paired files differ only in
 * the WALLET wordmark color required by light and dark host surfaces.
 */
export function Lockup({ width = 122 }: { width?: number }) {
  return (
    <span
      className="dxw-lockup"
      role="img"
      aria-label="Dexter Wallet"
      style={{ width }}
    >
      <img
        className="dxw-lockup__image dxw-lockup__image--light"
        src={walletLockupLight}
        alt=""
        aria-hidden="true"
      />
      <img
        className="dxw-lockup__image dxw-lockup__image--dark"
        src={walletLockupDark}
        alt=""
        aria-hidden="true"
      />
    </span>
  );
}
