import { GOVERNED_ASSET_WIDGET_URIS } from '../../apps-sdk/widget-uris.mjs';
import {
  buildGovernedAssetFailure,
  normalizeGovernedAssetResult,
} from '../../lib/governed-asset-result.mjs';
import { canonicalHash } from '../../lib/governed-canonical-identity.mjs';
import { dynamicStockV2Fixture } from './governed-stock-v2.fixtures.mjs';

const OPERATION_ID = '019f981c-9215-7141-84f2-d89ffe9cbece';

function acceptedOutput({ operation, input, httpStatus, body }) {
  const result = normalizeGovernedAssetResult({
    operation,
    input,
    httpStatus,
    body,
  });
  if (result.body.namespace === 'opendexter-governed-backend-failure/v1') {
    throw new TypeError(`invalid governed renderer ${operation} fixture`);
  }
  return result.body;
}

function reconcileEnvelope({
  outcome,
  phase,
  mutated,
  stateVersionBefore,
  code,
  explanation,
  statusAfter,
}) {
  const identity = {
    namespace: 'dexter-governed-agent-reconcile/v1',
    outcome,
    phase,
    intentId: statusAfter.intentId,
    attemptId: statusAfter.attemptId,
    mutated,
    stateVersionBefore,
    code,
    explanation,
    statusAfter,
  };
  return { ...identity, digest: canonicalHash(identity) };
}

function actionSurface({ id, title, input, output, stage }) {
  return {
    id,
    title,
    file: 'governed-action.html',
    resourceUri: GOVERNED_ASSET_WIDGET_URIS.action,
    tools: [],
    input,
    output,
    metadata: {},
    readySelector: `.dx-action[data-stage="${stage}"]`,
    outerSelector: '.dx-widget',
  };
}

function historySurface({ id, title, input, output, metadata, readySelector }) {
  return {
    id,
    title,
    file: 'governed-history.html',
    resourceUri: GOVERNED_ASSET_WIDGET_URIS.history,
    tools: [],
    input,
    output,
    metadata,
    readySelector,
    outerSelector: '.dx-widget',
  };
}

export function buildGovernedRendererStateSurfaces() {
  const governed = dynamicStockV2Fixture('tesla', OPERATION_ID);
  const intentInput = { intentId: governed.status.intentId };
  const executeInput = {
    operationId: OPERATION_ID,
    intentId: governed.status.intentId,
  };

  const refusedExecute = structuredClone(governed.execute);
  Object.assign(refusedExecute, {
    status: 'refused',
    executed: false,
    code: 'definitively_not_landed',
    explanation: 'Authoritative reconciliation proved this exact transaction did not land.',
  });
  Object.assign(refusedExecute.business, {
    lifecycle: 'refused',
    settlement: 'definitively-not-landed',
    finality: 'not-final',
    executionSucceeded: false,
    programError: false,
    reconciliation: { required: false, availableToOwner: false },
  });

  const ambiguousStatus = structuredClone(governed.status);
  Object.assign(ambiguousStatus, {
    status: 'ambiguous',
    ledgerState: 'ambiguous',
    submitted: null,
    landingProof: false,
    definitiveNonlandingProof: false,
    executionSucceeded: null,
    confirmationSlot: null,
    confirmationCommitment: null,
    settlementFinalized: false,
    reconciliationRequired: true,
    canReconcile: true,
    reconciliationKind: null,
    reconciliationEvidenceDigest: null,
    refusalSource: null,
    refusalCode: null,
    receiptPhases: ['dispatch_fenced', 'uncertain'],
  });
  const pendingReconcile = reconcileEnvelope({
    outcome: 'pending',
    phase: 'validator-reconciliation',
    mutated: false,
    stateVersionBefore: ambiguousStatus.stateVersion,
    code: 'agent_reconciliation_still_uncertain',
    explanation: 'The exact same-intent reconciliation remains pending.',
    statusAfter: ambiguousStatus,
  });

  const successfulStatus = structuredClone(governed.status);
  Object.assign(successfulStatus, {
    stateVersion: governed.status.stateVersion + 1,
    lastActivityAt: '2026-08-01T00:02:00.000Z',
    confirmationCommitment: 'finalized',
    settlementFinalized: true,
    reconciliationRequired: false,
    canReconcile: false,
    receiptPhases: [
      'dispatch_fenced',
      'reconciled_confirmed',
      'reconciled_finalized',
    ],
  });
  const successfulReconcile = reconcileEnvelope({
    outcome: 'advanced',
    phase: 'final',
    mutated: true,
    stateVersionBefore: governed.status.stateVersion,
    code: null,
    explanation: 'The same durable attempt reached finalized successful execution.',
    statusAfter: successfulStatus,
  });

  const failedStatus = structuredClone(governed.status);
  Object.assign(failedStatus, {
    status: 'refused',
    ledgerState: 'provably_not_landed',
    stateVersion: governed.status.stateVersion + 1,
    lastActivityAt: '2026-08-01T00:02:00.000Z',
    submitted: false,
    landingProof: false,
    definitiveNonlandingProof: true,
    executionSucceeded: false,
    confirmationSlot: null,
    confirmationCommitment: null,
    settlementFinalized: false,
    reconciliationRequired: false,
    canReconcile: false,
    reconciliationKind: 'validator_refused_before_contact',
    reconciliationEvidenceDigest: 'f'.repeat(64),
    refusalSource: null,
    refusalCode: null,
    receiptPhases: ['dispatch_fenced', 'refused_before_contact'],
  });
  const failedReconcile = reconcileEnvelope({
    outcome: 'advanced',
    phase: 'final',
    mutated: true,
    stateVersionBefore: governed.status.stateVersion,
    code: null,
    explanation: 'The same durable attempt was proved not to have landed.',
    statusAfter: failedStatus,
  });

  const emptyHistory = {
    namespace: 'dexter-governed-transaction-history/v1',
    items: [],
    nextCursor: null,
  };
  const historyError = buildGovernedAssetFailure({
    operation: 'history',
    input: {},
    code: 'governed_backend_response_invalid',
  }).body;

  return [
    actionSurface({
      id: 'governed-execute-confirmed',
      title: 'Governed Action Confirmed',
      input: executeInput,
      output: acceptedOutput({
        operation: 'execute',
        input: executeInput,
        httpStatus: 200,
        body: governed.execute,
      }),
      stage: 'success',
    }),
    actionSurface({
      id: 'governed-execute-refused',
      title: 'Governed Action Refused',
      input: executeInput,
      output: acceptedOutput({
        operation: 'execute',
        input: executeInput,
        httpStatus: 422,
        body: refusedExecute,
      }),
      stage: 'failure',
    }),
    actionSurface({
      id: 'governed-reconcile-pending',
      title: 'Governed Reconciliation Pending',
      input: intentInput,
      output: acceptedOutput({
        operation: 'reconcile',
        input: intentInput,
        httpStatus: 202,
        body: pendingReconcile,
      }),
      stage: 'pending',
    }),
    actionSurface({
      id: 'governed-reconcile-success',
      title: 'Governed Reconciliation Confirmed',
      input: intentInput,
      output: acceptedOutput({
        operation: 'reconcile',
        input: intentInput,
        httpStatus: 200,
        body: successfulReconcile,
      }),
      stage: 'success',
    }),
    actionSurface({
      id: 'governed-reconcile-failure',
      title: 'Governed Reconciliation Failed',
      input: intentInput,
      output: acceptedOutput({
        operation: 'reconcile',
        input: intentInput,
        httpStatus: 200,
        body: failedReconcile,
      }),
      stage: 'failure',
    }),
    actionSurface({
      id: 'governed-status-direct',
      title: 'Governed Action Status',
      input: intentInput,
      output: acceptedOutput({
        operation: 'status',
        input: intentInput,
        httpStatus: 200,
        body: governed.status,
      }),
      stage: 'success',
    }),
    historySurface({
      id: 'governed-history-empty',
      title: 'Dexter Wallet History',
      input: {},
      output: acceptedOutput({
        operation: 'history',
        input: {},
        httpStatus: 200,
        body: emptyHistory,
      }),
      metadata: {},
      readySelector: '.dx-history [data-state="empty"]',
    }),
    historySurface({
      id: 'governed-history-error',
      title: 'Dexter Wallet History',
      input: {},
      output: null,
      metadata: { 'dexter/governedWidgetResult': historyError },
      readySelector: '[data-state="error"]',
    }),
  ];
}
