import { useState } from 'react';
import { activityLinkAllowed, activitySubtitle, formatActivityAmount, type WalletActivityItem } from './activityModel';
import { relativeTime } from './format';

export function ActivityRow({ item, onOpenExternal }: { item: WalletActivityItem; onOpenExternal: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const links = item.links.filter((link) => activityLinkAllowed(link.url));
  return (
    <div className="dxw-activity-entry">
      <button className="dxw-act-row" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className="dxw-act-copy">
          <span className="dxw-act-main">{item.title}</span>
          <span className="dxw-act-sub">{relativeTime(item.occurredAt)} · {activitySubtitle(item)}</span>
        </span>
        <span className="dxw-act-amt">{formatActivityAmount(item.amount)}</span>
      </button>
      {expanded ? (
        <div className="dxw-activity-details">
          <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time>
          {item.amounts.map(({ role, amount }, index) => <p key={`${role}-${index}`}>{role}: {formatActivityAmount(amount)}</p>)}
          {item.details.map(({ label, value }, index) => <p key={`${label}-${index}`}>{label}: {value}</p>)}
          {links.length ? <div className="dxw-activity-links">{links.map((link) => (
            <button type="button" key={`${link.kind}-${link.url}`} onClick={() => onOpenExternal(link.url)}>{link.label}</button>
          ))}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
