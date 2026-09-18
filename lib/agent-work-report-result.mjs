import { AGENT_WORK_REPORT_OUTPUT_SCHEMA } from './agent-work-report-contract.mjs';

const ERROR_TEXT = Object.freeze({
  agent_work_invalid_request: 'The work report was rejected. Correct the request before sending an update.',
  agent_work_runtime_auth_invalid: 'The work report could not authenticate this connection. Restore connection access before sending an update.',
  agent_work_identity_invalid: 'Work reporting is unavailable for this connected agent.',
  agent_work_idempotency_conflict: 'This report ID already belongs to different content. Preserve its original request. Use a new report ID only for a deliberate update.',
  agent_work_revision_conflict: 'A different report is current. Read currentReport and currentRevision. If the task still calls for an update, send it deliberately with a new operationId and that revision.',
  agent_work_store_unavailable: 'The work report could not be confirmed. Recover it with the same operationId and identical content.',
  transport_failed: 'The work report response did not arrive. Recover it with the same operationId and identical content.',
  response_invalid: 'The work report response could not be verified. Recover it with the same operationId and identical content.',
  rate_limited: 'Work reporting is temporarily rate limited. Respect retryAfterMs when supplied, then use the same operationId and identical content.',
  configuration_unavailable: 'Work reporting is unavailable while its connection configuration is repaired. Preserve this request for recovery.',
});

export function buildAgentWorkReportModelResult({ input, result }) {
  const body = AGENT_WORK_REPORT_OUTPUT_SCHEMA.parse(result);
  if (body.operationId !== null && body.operationId !== input.operationId) {
    throw new TypeError('agent_work_result_identity_mismatch');
  }
  const acknowledged = body.namespace === 'dexter-agent-work-report-ack/v1';
  const savedSummary = acknowledged && body.report.summary !== null ? `: ${body.report.summary}` : '.';
  const text = acknowledged
    ? `${body.replayed ? 'Saved work update recovered' : 'Work update saved'}${savedSummary}\n`
      + `Reported status: ${body.report.state[0].toUpperCase()}${body.report.state.slice(1)}.`
      + (body.replayed ? '\nThis is the original update. A newer update may already exist.' : '')
    : ERROR_TEXT[body.code];
  return {
    content: [{ type: 'text', text }],
    structuredContent: body,
    isError: !acknowledged,
    _meta: { 'dexter/agentWorkReportRequest': { operationId: input.operationId } },
  };
}
