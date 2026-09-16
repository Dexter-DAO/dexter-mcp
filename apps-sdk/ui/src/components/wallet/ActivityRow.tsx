import { useState } from 'react';
import { activityDateTime, activityLinkAllowed, activityServiceUrl, activitySubtitle, formatActivityAmount, type WalletActivityItem } from './activityModel';
import { Chevron } from './icons';

export function ActivityRow({ item, onOpenExternal }: { item: WalletActivityItem; onOpenExternal: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const serviceUrl = activityServiceUrl(item);
  const links = item.links.filter((link) => activityLinkAllowed(link.url) && (link.kind !== 'service' || link.url === serviceUrl));
  const transaction = links.find((link) => link.kind === 'transaction');
  const logo = item.service ? item.service.logoUrl : item.asset?.logoUrl;
  const initials = (item.service?.provider ?? item.service?.name ?? item.asset?.symbol ?? item.title).split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const description = item.service?.description ?? item.asset?.description;
  const subtitle = activitySubtitle(item);
  const amountText = item.amount ? formatActivityAmount(item.amount) : '–';
  const dateTime = activityDateTime(item.occurredAt);
  return (
    <div className="dxw-activity-entry">
      <div className="dxw-act-row">
        <button className="dxw-activity-identity" type="button" onClick={() => serviceUrl ? onOpenExternal(serviceUrl) : setExpanded(!expanded)}
          aria-expanded={serviceUrl ? undefined : expanded} title={serviceUrl ? `View ${item.service?.name} on Indexter` : undefined}>
          <span className="dxw-activity-mark" aria-hidden="true">
            {logo && activityLinkAllowed(logo) && !imageFailed ? <img src={`https://api.dexter.cash/api/img?url=${encodeURIComponent(logo)}`} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : initials}
          </span>
          <span className="dxw-act-copy">
            <span className="dxw-act-main">{item.title}</span>
            {subtitle ? <span className="dxw-act-sub">{subtitle}</span> : null}
          </span>
        </button>
        <button className="dxw-activity-value" type="button" onClick={() => transaction ? onOpenExternal(transaction.url) : setExpanded(!expanded)}
          title={transaction?.label ?? 'View receipt'} aria-label={`${item.amount ? amountText : 'Amount unavailable'}, ${dateTime}. ${transaction?.label ?? 'View receipt'}`}>
          <span className="dxw-act-amt">{amountText}</span>
          <time dateTime={item.occurredAt}>{dateTime}</time>
        </button>
        <button className="dxw-activity-expand" type="button" aria-label={`${expanded ? 'Hide' : 'Show'} receipt for ${item.title}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Chevron /></button>
      </div>
      {expanded ? (
        <div className="dxw-activity-details">
          {description ? <p>{description}</p> : null}
          <dl>
            {item.amounts.map(({ role, amount }, index) => <div key={`${role}-${index}`}><dt>{role[0].toUpperCase() + role.slice(1)}</dt><dd>{formatActivityAmount(amount)}</dd></div>)}
            {item.details.map(({ label, value }, index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          {links.length ? <div className="dxw-activity-links">{links.map((link) => (
            <button type="button" key={`${link.kind}-${link.url}`} onClick={() => onOpenExternal(link.url)}>{link.label}</button>
          ))}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
