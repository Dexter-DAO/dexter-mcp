/**
 * The WebAuthn probe may record user-agent, network address, and diagnostic
 * payloads. Keep that sink off unless an operator deliberately enables it in
 * a non-production environment.
 */
export function isWebauthnProbeTelemetryEnabled(env = process.env) {
  const explicitlyEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(env.OPEN_MCP_ENABLE_WEBAUTHN_PROBE_TELEMETRY || '').trim().toLowerCase(),
  );
  return explicitlyEnabled && String(env.NODE_ENV || '').trim().toLowerCase() !== 'production';
}
