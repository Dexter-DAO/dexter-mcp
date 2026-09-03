import indexterWordmark from '../../assets/indexter-wordmark.svg?url';
import indexterWordmarkReversed from '../../assets/indexter-wordmark-reversed.svg?url';
import { useAdaptiveTheme } from '../../sdk';

export function IndexterLockup() {
  const theme = useAdaptiveTheme();

  return (
    <span className="dx-indexter-lockup">
      <img
        className="dx-indexter-lockup__asset"
        src={theme === 'dark' ? indexterWordmarkReversed : indexterWordmark}
        alt="Indexter"
        width={176}
        height={28}
        style={{
          display: 'block',
          width: 'clamp(132px, 24vw, 176px)',
          height: 'auto',
        }}
      />
    </span>
  );
}
