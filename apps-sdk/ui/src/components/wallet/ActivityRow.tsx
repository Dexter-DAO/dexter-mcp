import { useState } from 'react';
import { activityChainName, activityDateTime, activityLinkAllowed, activityReceiptFacts, activityServiceUrl, activitySubtitle, activityTitle, formatActivityAmount, type WalletActivityItem } from './activityModel';
import { Chevron } from './icons';

export function ActivityRow({ item, onOpenExternal }: { item: WalletActivityItem; onOpenExternal: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const serviceUrl = activityServiceUrl(item);
  const links = item.links.filter((link) => activityLinkAllowed(link.url) && (link.kind !== 'service' || link.url === serviceUrl));
  const transaction = links.find((link) => link.kind === 'transaction');
  const transactions = links.filter((link) => link.kind === 'transaction');
  const logo = item.service ? item.service.logoUrl : item.asset?.logoUrl;
  const initials = (item.service?.provider ?? item.service?.name ?? item.asset?.symbol ?? item.title).split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const description = item.service ? null : item.asset?.description;
  const serviceDescription = item.service?.description;
  const subtitle = activitySubtitle(item);
  const actorName = item.actor.kind === 'agent' ? item.actor.name : null;
  const actorMark = actorName === 'Codex' || actorName === 'ChatGPT' ? 'chatgpt-official.png' : actorName === 'Claude' ? 'claude-official.svg' : 'dexter-logo-main.svg';
  const amountText = item.amount ? formatActivityAmount(item.amount) : '–';
  const dateTime = activityDateTime(item.occurredAt);
  const amounts = item.amounts.filter(({ amount }) => !item.amount || amount.atomic !== item.amount.atomic || amount.mint !== item.amount.mint || amount.network !== item.amount.network);
  const facts = activityReceiptFacts(item);
  const hasDetails = Boolean(description || amounts.length || facts.length || transactions.length > 1);
  const openIdentity = () => serviceUrl ? onOpenExternal(serviceUrl) : hasDetails ? setExpanded(!expanded) : transaction ? onOpenExternal(transaction.url) : undefined;
  return (
    <div className="dxw-activity-entry">
      <div className="dxw-act-row">
        <button className="dxw-activity-identity" type="button" onClick={openIdentity} disabled={!serviceUrl && !hasDetails && !transaction}
          aria-expanded={!serviceUrl && hasDetails ? expanded : undefined} title={serviceUrl ? `View ${item.service?.name} on Indexter` : undefined}>
          <span className={`dxw-activity-mark${item.kind === 'trade' ? ' dxw-activity-mark--stock' : ''}`} aria-hidden="true">
            {logo && activityLinkAllowed(logo) && !imageFailed ? <img src={`https://api.dexter.cash/api/img?url=${encodeURIComponent(logo)}`} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : initials}
          </span>
          <span className="dxw-act-copy">
            <span className="dxw-act-main">{activityTitle(item)}</span>
            {subtitle ? <span className="dxw-act-sub">{subtitle.split(' · ').map((part, index) => <span key={`${part}-${index}`}>{index ? ' · ' : null}{part === actorName ? <span className="dxw-activity-actor"><img src={`https://api.dexter.cash/api/img?url=${encodeURIComponent(`https://dexter.cash/opendexter-clients/${actorMark}`)}`} alt="" />{part}</span> : part}</span>)}</span> : null}
            {serviceDescription ? <span className="dxw-act-description">{serviceDescription}</span> : null}
          </span>
        </button>
        <button className="dxw-activity-value" type="button" disabled={!transaction && !hasDetails} onClick={() => transaction ? onOpenExternal(transaction.url) : setExpanded(!expanded)}
          title={transaction?.label ?? 'View receipt'} aria-label={`${item.amount ? amountText : 'Amount unavailable'}, ${dateTime}. ${transaction?.label ?? 'View receipt'}`}>
          <span className="dxw-act-amt">{amountText}</span>
          <time dateTime={item.occurredAt}>{dateTime}</time>
        </button>
        {hasDetails ? <button className="dxw-activity-expand" type="button" aria-label={`${expanded ? 'Hide' : 'Show'} receipt for ${item.title}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Chevron /></button> : <span />}
      </div>
      {expanded ? (
        <div className="dxw-activity-details">
          {description ? <p>{description}</p> : null}
          {amounts.map(({ role, amount }, index) => {
            const amountLogo = amount.mint === item.asset?.mint ? item.asset.logoUrl : null;
            const text = `${formatActivityAmount(amount).replace(/^−/, '')} ${role}`;
            const content = <>{amountLogo && activityLinkAllowed(amountLogo) ? <img src={`https://api.dexter.cash/api/img?url=${encodeURIComponent(amountLogo)}`} alt="" referrerPolicy="no-referrer" /> : null}<span>{text}</span></>;
            return transaction ? <button className="dxw-activity-quantity" type="button" key={`${role}-${index}`} onClick={() => onOpenExternal(transaction.url)}>{content}</button> : <p className="dxw-activity-quantity" key={`${role}-${index}`}>{content}</p>;
          })}
          {facts.map((fact, index) => <p key={index}>{fact}</p>)}
          {transactions.length > 1 ? <div className="dxw-activity-links">{transactions.slice(1).map((link) => {
            const chain = activityChainName(link.url);
            const label = `${item.kind === 'payment' ? 'Seller' : 'Additional'} transaction on ${chain}`;
            const chainLogo = chain === 'Base' || chain === 'Solana' ? `https://dexter.cash/assets/chains/${chain.toLowerCase()}.svg` : null;
            return <button type="button" key={link.url} title={label} aria-label={label} onClick={() => onOpenExternal(link.url)}>{chainLogo ? <img src={`https://api.dexter.cash/api/img?url=${encodeURIComponent(chainLogo)}`} alt="" /> : null}<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" /></svg></button>;
          })}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
