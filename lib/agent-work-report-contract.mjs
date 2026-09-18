import { z } from 'zod';

export const AGENT_WORK_REPORT_TOOL_NAME = 'dexter_report_work';

const uuid = z.string().uuid()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    'UUID must use canonical lowercase spelling')
  .describe('Canonical lowercase UUID.');
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const state = z.enum(['working', 'waiting', 'blocked', 'completed', 'failed', 'idle']);
const summary = z.string().min(1).max(200).refine((value) => (
  value === value.trim() && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)
), 'summary must be trimmed plain text on one line');
const timestamp = z.string().datetime().refine((value) => Number.isFinite(Date.parse(value)));

function validateSummary(value, context) {
  if (value.state !== 'idle' && value.summary == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['summary'],
      message: 'summary is required for this state' });
  }
}

export const AGENT_WORK_REPORT_INPUT_SCHEMA = z.object({
  operationId: uuid.describe('Canonical lowercase UUID for this report. Reuse it with identical content after an uncertain response.'),
  expectedRevision: revision.default(0)
    .describe('Revision being replaced. Use zero for the first report.'),
  state: state.describe('Your current work state, as reported by you.'),
  summary: summary.nullable().optional()
    .describe('One trimmed line describing the work. Idle may omit it.'),
  ttlSeconds: z.number().int().min(30).max(900).optional()
    .describe('How long the report is fresh. The server defaults to 300 seconds.'),
}).strict().superRefine(validateSummary).transform((value) => ({
  operationId: value.operationId,
  expectedRevision: value.expectedRevision,
  state: value.state,
  summary: value.summary ?? null,
  ...(value.ttlSeconds === undefined ? {} : { ttlSeconds: value.ttlSeconds }),
}));

const report = z.object({
  reportId: uuid,
  revision: revision.refine((value) => value > 0),
  state,
  summary: summary.nullable(),
  source: z.literal('agent_report'),
  observedAt: timestamp,
  expiresAt: timestamp,
}).strict().superRefine((value, context) => {
  validateSummary(value, context);
  const duration = Date.parse(value.expiresAt) - Date.parse(value.observedAt);
  if (!Number.isSafeInteger(duration) || duration < 30_000 || duration > 900_000
    || duration % 1_000 !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'],
      message: 'report freshness must be 30 to 900 whole seconds' });
  }
});

export const AGENT_WORK_REPORT_REGISTRATION_OUTPUT_SCHEMA = z.object({
  namespace: z.literal('dexter-agent-work-report-ack/v1'),
  operationId: uuid,
  replayed: z.boolean(),
  report,
}).strict();

const acknowledgment = AGENT_WORK_REPORT_REGISTRATION_OUTPUT_SCHEMA.superRefine((value, context) => {
  if (value.operationId !== value.report.reportId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['report', 'reportId'],
      message: 'reportId must equal operationId' });
  }
});

const apiError = z.object({
  namespace: z.literal('dexter-agent-work-report-error/v1'),
  code: z.enum([
    'agent_work_invalid_request',
    'agent_work_runtime_auth_invalid',
    'agent_work_identity_invalid',
    'agent_work_idempotency_conflict',
    'agent_work_revision_conflict',
    'agent_work_store_unavailable',
  ]),
  retryable: z.boolean(),
  operationId: uuid.nullable(),
  retryWithSameOperationOnly: z.boolean(),
  currentRevision: revision.nullable(),
  currentReport: report.nullable(),
}).strict().superRefine((value, context) => {
  const unavailable = value.code === 'agent_work_store_unavailable';
  const conflict = value.code === 'agent_work_revision_conflict';
  const validRevision = conflict
    ? value.currentRevision === 0
      ? value.currentReport === null
      : value.currentRevision !== null && value.currentReport !== null
        && value.currentRevision === value.currentReport.revision
    : value.currentRevision === null && value.currentReport === null;
  if (value.retryable !== unavailable || value.retryWithSameOperationOnly !== unavailable || !validRevision) {
    context.addIssue({ code: z.ZodIssueCode.custom,
      message: 'report error recovery fields are inconsistent' });
  }
});

const localError = z.object({
  namespace: z.literal('opendexter-agent-work-report-local-error/v1'),
  code: z.enum(['transport_failed', 'response_invalid', 'rate_limited', 'configuration_unavailable']),
  operationId: uuid,
  retryable: z.boolean(),
  retryWithSameOperationOnly: z.literal(true),
  retryAfterMs: z.number().int().min(0).max(86_400_000).nullable(),
}).strict().superRefine((value, context) => {
  if (value.retryable !== (value.code !== 'configuration_unavailable')
    || (value.code !== 'rate_limited' && value.retryAfterMs !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom,
      message: 'local report recovery fields are inconsistent' });
  }
});

export const AGENT_WORK_REPORT_OUTPUT_SCHEMA = z.union([acknowledgment, apiError, localError]);
