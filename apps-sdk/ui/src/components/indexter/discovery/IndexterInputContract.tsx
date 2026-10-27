import { useEffect, useMemo, useState } from 'react';
import { indexterCurrentFailureMessage } from '../../../../../../lib/indexter-endpoint-availability.mjs';
import { useAdaptiveTheme, useAdaptiveHostContext } from '../../../sdk';
import { IndexterLockup } from '../../brand/IndexterLockup';
import { useIntrinsicHeight } from '../../x402/useIntrinsicHeight';
import { splitPublishedContract, type IndexterInputContractPayload } from './discovery-model';

function ContractPages({ page, count, onPage }: { page: number; count: number; onPage: (value: number) => void }) {
  if (count <= 1) return null;
  return <nav className="dx-input-contract__pages" aria-label="Input contract pages">
    <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
    <span aria-live="polite">{page + 1} of {count}</span>
    <button type="button" disabled={page + 1 === count} onClick={() => onPage(page + 1)}>Next</button>
  </nav>;
}

/** Catalog-only view. Opening it never calls the selected endpoint. */
export function IndexterInputContract({ payload }: { payload: IndexterInputContractPayload }) {
  const theme = useAdaptiveTheme();
  const context = useAdaptiveHostContext();
  const root = useIntrinsicHeight<HTMLDivElement>();
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  const contract = payload.contract;
  const fields = contract?.requestInput?.fields;
  const failureMessage = contract?.action.kind === 'endpoint_unavailable'
    ? indexterCurrentFailureMessage(contract.action.reason) : null;
  const narrow = (context.containerDimensions?.width ?? 390) <= 480;
  const fieldPageSize = narrow ? (failureMessage ? 3 : 4) : 6;
  const [fieldPage, setFieldPage] = useState(0);
  const [schemaPage, setSchemaPage] = useState(0);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const published = JSON.stringify(payload.publishedContract, null, 2);
  const schemaPages = useMemo(() => splitPublishedContract(published, narrow ? 160 : 600, narrow ? 6 : 14), [published, narrow]);
  useEffect(() => { setFieldPage(0); setSchemaPage(0); setSchemaOpen(false); }, [published]);
  const visibleFieldPage = Math.min(fieldPage, Math.max(0, Math.ceil((fields?.length ?? 0) / fieldPageSize) - 1));
  const visibleSchemaPage = Math.min(schemaPage, schemaPages.length - 1);
  return (
    <div className="dxs-root dx-search-shell" ref={root}>
      <header className="dx-search-shell__header"><IndexterLockup /></header>
      <section className="dx-search-experience dx-input-contract">
        <div>
          <h2 title={contract?.displayName}>{contract?.displayName ?? 'Inputs unavailable'}</h2>
          {contract?.description ? <p className="dx-input-contract__description" title={contract.description}>{contract.description}</p> : null}
          <p className="dx-input-contract__target" title={contract?.resourceUrl ?? payload.contractRequest.resourceId}>
            <strong>{payload.contractRequest.method}</strong>{' '}
            {contract?.resourceUrl ?? payload.contractRequest.resourceId}
          </p>
        </div>
        {!contract ? <p role="status">{payload.warnings[0]?.message ?? 'The catalog input contract could not be read.'}</p>
          : schemaOpen ? null : fields ? (
            fields.length ? <div>
              <h3>Request inputs</h3>
              <dl className="dx-input-contract__fields">
                {fields.slice(visibleFieldPage * fieldPageSize, (visibleFieldPage + 1) * fieldPageSize).map((field) => (
                  <div key={`${field.location}:${field.name}`}>
                    <dt>{field.name}</dt>
                    <dd>
                      {field.type === 'array' ? `${field.items?.type} list` : field.type}
                      {' in '}{field.location}{' · '}{field.required ? 'Required' : 'Optional'}
                      {field.type === 'array' ? ` · ${field.minItems}–${field.maxItems} items` : ''}
                    </dd>
                  </div>
                ))}
              </dl>
              <ContractPages page={visibleFieldPage} count={Math.ceil(fields.length / fieldPageSize)} onPage={setFieldPage} />
            </div> : <p>{contract.inputContract?.status === 'not_published'
              ? 'The catalog has no published input fields for this endpoint.'
              : 'This contract declares no input fields.'}</p>
          ) : null}
        {contract?.action.kind === 'endpoint_unavailable' ? <p role="status">
          {failureMessage ?? <>Published inputs are available to read. {contract.action.reason === 'input_contract_unavailable'
            ? 'The request tool does not support this format.'
            : contract.action.reason === 'safety_unavailable'
              ? 'Execution safety information is unavailable.'
              : 'This endpoint is unavailable for execution.'}</>}
        </p> : null}
        {!schemaOpen && contract?.inputContract?.reason === 'input_format_unsupported' ? <p>
          These inputs use a format the simple form cannot display. Read the complete schema below to construct the request in chat.
        </p> : null}
        {!schemaOpen && contract?.action.kind === 'review_endpoint' && contract.action.safety.checkMayAffectProvider
          ? <p>Checking this endpoint may affect the provider. Review the request and its consequences before continuing.</p> : null}
        {payload.publishedContract ? <details open={schemaOpen} onToggle={event => setSchemaOpen(event.currentTarget.open)}>
          <summary>Published input contract</summary>
          {schemaOpen ? <>
            <pre className="dx-input-contract__schema">{schemaPages[visibleSchemaPage]}</pre>
            <ContractPages page={visibleSchemaPage} count={schemaPages.length} onPage={setSchemaPage} />
          </> : null}
        </details> : null}
        <p className="dx-input-contract__provenance">Published catalog information. The seller was not contacted.</p>
      </section>
    </div>
  );
}
