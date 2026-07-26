import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });
import * as Sentry from '@sentry/node';
import {
  safeTelemetryError,
  safeTelemetryLabel,
  safeTelemetryUrl,
  sanitizeTelemetryRecord,
} from './apps-sdk/telemetry-sanitizer.mjs';

const OPEN_MCP_DSN = process.env.SENTRY_OPEN_MCP_DSN || process.env.SENTRY_DSN || '';

Sentry.init({
  dsn: OPEN_MCP_DSN,
  environment: process.env.NODE_ENV || 'production',
  tracesSampleRate: 0,
  sendDefaultPii: false,
  integrations(defaultIntegrations) {
    return defaultIntegrations.filter(
      (integration) =>
        !['Console', 'Http', 'NodeFetch', 'RequestData'].includes(integration.name),
    );
  },
  initialScope: { tags: { service: 'dexter-open-mcp' } },
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === 'console') return null;
    return {
      ...breadcrumb,
      message: breadcrumb.message
        ? safeTelemetryLabel(breadcrumb.message)
        : undefined,
      data: breadcrumb.data
        ? sanitizeTelemetryRecord(breadcrumb.data)
        : undefined,
    };
  },
  beforeSend(event) {
    if (!OPEN_MCP_DSN) return null;
    const clean = {
      ...event,
      message: event.message
        ? safeTelemetryLabel(event.message)
        : undefined,
      transaction: event.transaction
        ? safeTelemetryLabel(event.transaction)
        : undefined,
      logentry: event.logentry
        ? {
            ...event.logentry,
            message: safeTelemetryLabel(event.logentry.message),
            params: undefined,
          }
        : undefined,
      tags: event.tags ? sanitizeTelemetryRecord(event.tags) : undefined,
      fingerprint: undefined,
      user: undefined,
      request: event.request
        ? {
            method: safeTelemetryLabel(event.request.method, 'UNKNOWN'),
            url: safeTelemetryUrl(event.request.url),
          }
        : undefined,
      extra: event.extra ? sanitizeTelemetryRecord(event.extra) : undefined,
      contexts: event.contexts
        ? sanitizeTelemetryRecord(event.contexts)
        : undefined,
      breadcrumbs: event.breadcrumbs?.map((breadcrumb) => ({
        ...breadcrumb,
        message: breadcrumb.message
          ? safeTelemetryLabel(breadcrumb.message)
          : undefined,
        data: breadcrumb.data
          ? sanitizeTelemetryRecord(breadcrumb.data)
          : undefined,
      })),
    };
    if (clean.exception?.values) {
      clean.exception = {
        ...clean.exception,
        values: clean.exception.values.map((value) => ({
          ...value,
          value: JSON.stringify(safeTelemetryError({
            name: value.type,
          })),
          stacktrace: value.stacktrace
            ? {
                ...value.stacktrace,
                frames: value.stacktrace.frames?.map((frame) => ({
                  ...frame,
                  filename: safeTelemetryUrl(frame.filename) || undefined,
                  abs_path: safeTelemetryUrl(frame.abs_path) || undefined,
                  context_line: undefined,
                  pre_context: undefined,
                  post_context: undefined,
                  vars: undefined,
                })),
              }
            : undefined,
        })),
      };
    }
    return clean;
  },
});

export { Sentry };
