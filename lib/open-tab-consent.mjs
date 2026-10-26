import { z } from 'zod';
import { callOpenX402IntentApi, readOpenX402ConsentUrl } from './open-x402-intent-api.mjs';

export const TAB_CONSENT_TOOL = 'x402_prepare_tab';
export const TAB_CONSENT_DESCRIPTION = 'Prepare a Tab permission for one checked purchase. Supply its intentId, exact amount in USDC base units, and proposed expiry in Unix seconds. Returns the account owner\'s approval link and proposed terms. Preparation saves a pending session; owner approval activates authority. Payment remains a separate action.';
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const atomic = z.string().regex(/^[1-9][0-9]{0,19}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const address = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
export const TAB_CONSENT_INPUT = z.object({
  intentId: uuid,
  maxAmountAtomic: atomic,
  expiresAtUnix: z.number().int().positive().max(Math.floor(Number.MAX_SAFE_INTEGER / 1_000)),
}).strict();
const preparation = z.object({
  caseId: uuid, ownerReviewUrl: z.string().url(),
  providerSessionId: uuid, gatewayIntentId: uuid, sessionPublicKey: address, sessionPublicKeyHex: digest,
  vaultPda: address, seller: address, network: z.literal('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
  asset: z.literal('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  proposedTerms: z.object({ maxAmountAtomic: atomic, maxRevolvingCapacityAtomic: atomic, expiresAtUnix: z.number().int().positive() }).strict(),
  proposedTermsDigest: digest, consentRequestId: uuid, consentRequestDigest: digest,
  consentUrl: z.string().url(), agentId: uuid, grantId: uuid, grantRevision: z.number().int().positive(),
  grantRevisionDigest: digest,
}).strict();
export const TAB_CONSENT_OUTPUT = z.object({
  ok: z.boolean(), intentId: uuid.optional(), status: z.literal('pending_consent').optional(),
  paymentDispatched: z.literal(false), preparation: preparation.optional(),
  error: z.string().optional(), authorizationRequired: z.boolean().optional(),
  consentUrl: z.string().url().optional(), retryWithSameIntentOnly: z.boolean().optional(),
}).strict();

export function createTabConsentHandler({ resolveSession, callApi = callOpenX402IntentApi }) {
  return async (args, extra) => {
    const result = (data) => ({ structuredContent: data, isError: !data.ok,
      content: [{ type: 'text', text: data.ok
        ? `Review the proposed Tab permission: ${data.preparation.ownerReviewUrl}`
        : data.consentUrl ? `Owner approval is required: ${data.consentUrl}`
          : `Tab preparation could not complete: ${data.error}.` }] });
    const parsed = TAB_CONSENT_INPUT.safeParse(args);
    if (!parsed.success) return result({ ok: false, error: 'invalid_tab_preparation_terms', paymentDispatched: false });
    const input = parsed.data;
    try {
      const session = await resolveSession(extra);
      if (!session.sessionId || !session.authenticated) return result({
        ok: false, intentId: input.intentId, paymentDispatched: false,
        error: session.lookupFailed ? 'vault_state_unavailable' : 'authentication_required',
        authorizationRequired: !session.lookupFailed,
      });
      const response = await callApi('tabPrepare', { ...input, sessionId: session.sessionId });
      const data = response.data;
      if (data?.ok === true) {
        // This is a public ledger UUID, distinct from the private MCP session
        // credential removed by the common result scrubber.
        const { sessionId: providerSessionId, ...fields } = data.preparation ?? {};
        const output = TAB_CONSENT_OUTPUT.parse({ ...data, preparation: { ...fields, providerSessionId } });
        const terms = output.preparation?.proposedTerms;
        if (output.intentId !== input.intentId || output.status !== 'pending_consent'
          || !output.preparation || !readOpenX402ConsentUrl({ consentUrl: output.preparation.consentUrl })
          || output.preparation.caseId !== output.preparation.providerSessionId
          || output.preparation.ownerReviewUrl !== `https://dexter.cash/mandate?case=${output.preparation.caseId}&review=1`
          || terms.maxAmountAtomic !== input.maxAmountAtomic
          || terms.maxRevolvingCapacityAtomic !== input.maxAmountAtomic
          || terms.expiresAtUnix !== input.expiresAtUnix) throw new Error('invalid_tab_preparation_response');
        return result(output);
      }
      const consentUrl = readOpenX402ConsentUrl(data);
      return result({ ok: false, intentId: input.intentId, paymentDispatched: false,
        error: typeof data?.error === 'string' && /^[a-z0-9_]{1,100}$/.test(data.error)
          ? data.error : 'tab_preparation_unavailable',
        ...(consentUrl ? { consentUrl } : {}), retryWithSameIntentOnly: true });
    } catch {
      return result({ ok: false, intentId: input.intentId, paymentDispatched: false,
        error: 'tab_preparation_unavailable', retryWithSameIntentOnly: true });
    }
  };
}
