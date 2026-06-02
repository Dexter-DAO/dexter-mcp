/**
 * @dexterai/x402-core
 *
 * Canonical types, formatters, and search client for the Dexter x402 ecosystem.
 *
 * This package is the single source of truth for:
 *   - The raw API response shape from dexter-api
 *   - The formatted consumer-facing resource shape
 *   - Price formatting, similarity rounding, volume formatting
 *   - The capability search HTTP client
 *   - The MCP search response builder
 *
 * Consumers: Open MCP, Auth MCP, OpenDexter npm, SDK, ChatGPT widget.
 * Add a new field to FormattedResource + formatResource() and every consumer
 * picks it up on the next build.
 */

// Types
export type {
  // Raw API shapes
  RawCapabilityResult,
  RawCapabilityResponse,
  RawPricing,
  RawPricingChain,
  RawVerification,
  RawUsage,
  RawGaming,
  RawEnrichment,

  // Consumer-facing shapes
  FormattedResource,
  CapabilitySearchOptions,
  CapabilitySearchResult,
  NoMatchReason,

  // MCP response shapes
  SearchResponse,
  SearchMeta,
  SearchMode,
} from './types.js';

// Formatters
export {
  formatResource,
  formatPrice,
  roundSimilarity,
  formatVolume,
} from './format.js';

// Search client
export { capabilitySearch } from './search.js';

// MCP response builders
export {
  buildSearchResponse,
  buildSearchErrorResponse,
} from './response.js';

// Endpoint pricing probe
export { checkEndpointPricing, parsePaymentRequiredHeader } from './check.js';
export type { CheckResult, PaymentOption } from './check.js';

// Bazaar-extension schema extractor
export { extractBazaarSchema } from './bazaar.js';
export type { BazaarSchema } from './bazaar.js';
