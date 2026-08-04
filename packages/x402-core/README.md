# `@dexterai/x402-core`

Canonical types, formatters, and a search client for the Dexter x402 ecosystem, shared by MCP servers, the SDK, and the ChatGPT widget.

## Requirements

- Node.js 18 or newer

## Install

```sh
npm install @dexterai/x402-core
```

## Examples

Search for a capability and format the result for an MCP consumer:

```js
import {
  capabilitySearch,
  buildSearchResponse,
} from '@dexterai/x402-core';

const result = await capabilitySearch({ query: 'weather data API' });
const response = buildSearchResponse(result);
```

Inspect an endpoint's current access and pricing requirements without paying:

```js
import { checkEndpointPricing } from '@dexterai/x402-core';

async function inspectEndpoint(endpointUrl) {
  return checkEndpointPricing({ url: endpointUrl, method: 'GET' });
}
```

Search and check utilities inspect, discover, and format information. They do not authorize or execute payment. `checkEndpointPricing` sends a live guarded HTTPS request, so a non-GET check may still have provider-side effects.

## Exports

- **Formats and types:** `formatResource`, `formatPrice`, `roundSimilarity`, `formatVolume`, plus raw capability, formatted resource, search, pricing, verification, usage, gaming, and enrichment types.
- **Capability search:** `capabilitySearch`.
- **Search response builders:** `buildSearchResponse` and `buildSearchErrorResponse`.
- **Endpoint pricing and challenge inspection:** `checkEndpointPricing`, `exactAtomicString`, `parsePaymentRequiredHeader`, `sellerAcceptSha256`, `CheckResult`, and `PaymentOption`.
- **Public URL guard:** `assertPublicExternalUrl`, `createPinnedLookup`, `fetchPublicExternalUrl`, `isPublicIpAddress`, `parseExternalHttpUrl`, and `UnsafeExternalUrlError`.
- **Bazaar schema extraction:** `extractBazaarSchema` and `BazaarSchema`.
- **Schema resolution:** `resolveInputSchema`, `resolveOutputSchema`, and their input, output, and source types.

## Project

- [Repository](https://github.com/Dexter-DAO/dexter-mcp)
- [Homepage](https://dexter.cash)
- License: MIT
