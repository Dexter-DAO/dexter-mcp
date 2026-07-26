# OpenDexter purchase contract v1

Status: B3 integration candidate. This contract is not release-ready against a
backend that does not implement the preparation, dispatch, and receipt
requirements below.

`opendexter.purchase.v1` keeps the seller's offer and the buyer's chosen
funding mode unchanged from a fresh check through execution. Direct Exact,
Native Tab, Gateway cash, and Gateway credit are separate modes. None is a
fallback for another.

## B3-owned wire types

```ts
type AtomicAmount = string; // /^[1-9]\d*$/; never JavaScript Number

type PurchaseMode =
  | "direct_exact"
  | "native_tab"
  | "gateway_cash"
  | "gateway_credit";

interface SellerOfferV1 {
  offerId: string;
  x402Version: 1 | 2;
  scheme: string;
  network: string;
  asset: string;
  amountAtomic: AtomicAmount;
  payTo: string;
  facilitator: string | null;
  expiresAt: string | null;
  rawAcceptSha256: string; // canonical digest of the complete raw accept
}

interface PurchaseRouteV1 {
  routeId: string;
  resourceUrl: string;
  resolvedUrl: string; // final public HTTPS URL observed by the guarded check
  method: "GET" | "POST" | "PUT" | "DELETE";
  payloadSha256: string;
  sellerOffer: SellerOfferV1;
}

interface PreparedPurchaseV1 {
  contractVersion: "opendexter.purchase.v1";
  preparedId: string;
  state: "prepared";
  preparedAt: string;
  expiresAt: string | null;
  mode: PurchaseMode;
  route: PurchaseRouteV1;
}

interface ExecutePurchaseV1 {
  purchase: PreparedPurchaseV1;
  approvedAmountCeilingAtomic: AtomicAmount;
}
```

The MCP tools expose `PreparedPurchaseV1` as `purchase` and the approved
ceiling as `maxAmountAtomic`. The ceiling is not inserted into or used to
rewrite the prepared object. In this candidate, an explicit hosted purchase
stops before the legacy API because that API has not adopted this contract.

Mode-to-seller-offer binding is exact:

- `direct_exact`, `gateway_cash`, and `gateway_credit` require the selected
  seller `exact` offer.
- `native_tab` requires the selected seller `tab` offer.
- Gateway modes change the buyer-side funding path while preserving the
  downstream seller offer.

## A3-owned backend interface

A3 may choose the HTTP route names. The implementation must provide these
semantics as one current backend lineage:

```ts
interface SessionDerivedAuthorityV1 {
  mcpSessionId: string;        // obtained from authenticated MCP transport
  durableBindingId: string;    // resolved server-side
  storedSwigIdentity: string;  // resolved server-side
}

interface PreparePurchaseInputV1 {
  authority: SessionDerivedAuthorityV1;
  proposed: PreparedPurchaseV1;
  challengeWitness: {
    observedAt: string;
    x402Version: 1 | 2;
    sellerOffer: SellerOfferV1;
  };
}

interface PreparePurchaseResultV1 {
  purchase: PreparedPurchaseV1;
  durableState: "prepared";
}

interface ExecutePurchaseInputV1 extends ExecutePurchaseV1 {
  authority: SessionDerivedAuthorityV1;
}

type PurchaseExecutionStateV1 =
  | "not_dispatched"
  | "dispatched"
  | "settled"
  | "rejected"
  | "unknown";

interface ExecutePurchaseResultV1 {
  state: PurchaseExecutionStateV1;
  providerStatus: number | null;
  providerData: unknown;
  purchaseReceipt: PurchaseReceiptV1;
}
```

`authority` is derived from the authenticated MCP session and durable binding.
A caller-supplied wallet address, user handle, Swig address, or bearer-like
lookup key is never authoritative.

Before any consequential dispatch, the backend must:

1. load and atomically claim the durable prepared record;
2. require equality of contract version, prepared ID, mode, route ID, seller
   offer ID, URL, method, payload digest, and approved ceiling;
3. fetch the stored resolved public HTTPS route with DNS pinning and redirects
   disabled, then compare the complete raw-accept digest as well as scheme,
   network, asset, atomic amount, recipient, facilitator, version, and expiry;
4. reject an expired offer or amount above the approved ceiling;
5. select only the requested mode adapter;
6. durably enter a pending/dispatching state before sending anything
   consequential.

The backend must never choose another seller offer, funding rail, or mode.
CrossPay must not be entered merely because Direct Exact is unavailable.
Native Tab and Gateway are independent adapters, not names for CrossPay or an
Exact fallback.

## Receipt union

Every API response for an explicit purchase returns the same identity fields:

```ts
interface ReceiptBaseV1 {
  contractVersion: "opendexter.purchase.v1";
  receiptId: string;
  preparedId: string;
  routeId: string;
  sellerOfferId: string;
  mode: PurchaseMode;
  dispatch: "not_dispatched" | "dispatched" | "unknown";
  retry:
    | "same_prepared_only"
    | "new_prepare_required"
    | "integration_required"
    | "reconcile_only"
    | "none";
  correlationId: string | null;
  approvedAmountCeilingAtomic: AtomicAmount;
  reason?: string;
}

interface SellerSettlementV1 {
  state: "not_dispatched" | "settled" | "unconfirmed";
  amountAtomic: AtomicAmount;
  network: string;
  asset: string;
  transaction: string | null;
}

type PurchaseReceiptV1 =
  | (ReceiptBaseV1 & {
      mode: "direct_exact";
      sellerSettlement: SellerSettlementV1;
    })
  | (ReceiptBaseV1 & {
      mode: "native_tab";
      voucher: {
        state: "not_issued" | "refused" | "accepted" | "unconfirmed";
        incrementAtomic: AtomicAmount | null;
        cumulativeAtomic: AtomicAmount | null;
        channelId: string | null;
        sequenceNumber: string | null;
      };
      sellerCashSettlement:
        | "not_settled"
        | "settled"
        | "unconfirmed";
    })
  | (ReceiptBaseV1 & {
      mode: "gateway_cash";
      buyerCash: {
        state:
          | "not_committed"
          | "reserved"
          | "charged"
          | "charge_unconfirmed"
          | "refund_pending"
          | "refunded";
      };
      sellerSettlement: SellerSettlementV1;
    })
  | (ReceiptBaseV1 & {
      mode: "gateway_credit";
      exposure: {
        state: "not_reserved" | "reserved" | "released" | "unconfirmed";
      };
      buyerObligation: {
        state: "not_finalized" | "finalized" | "reversed" | "unconfirmed";
        claimId: string | null;
      };
      sellerSettlement: SellerSettlementV1;
    });
```

A Native Tab voucher is not seller cash settlement. Gateway cash keeps the
buyer cash state separate from seller settlement. Gateway credit additionally
keeps exposure and the buyer obligation separate. No generic `paid` boolean may
replace these fields.

If the API also returns a generic `payment.dispatched` or `payment.settled`
summary, it must agree with the typed receipt. A contradiction rejects the
backend receipt; the wrapper does not choose whichever field looks more
favorable.

After `dispatch: "dispatched"` or `"unknown"`, `retry` must be
`"reconcile_only"` or `"none"`. The backend must not automatically redispatch.
Reconciliation reads the durable prepared identity and returns the latest typed
receipt.

## Current integration gate

The B3 wrapper validates the request-bound prepared object and rejects every
explicit hosted mode before the legacy payment, OAuth, or activation path. It
therefore cannot lose the selected route or move money through the wrong
adapter. When A3 connects the durable API, that integration must preserve the
prepared identity and ceiling across OAuth/activation and the wrapper will
accept a backend receipt only when its identities and mode-specific state
agree.

The A3 API must still provide durable preparation, exact fresh-offer
comparison, requested-mode dispatch, pending/reconciliation state, and this
typed receipt. Until that lands in the same release candidate, the combined
hosted path has not proved Universal Purchasing Parity and must not be deployed
as though it has.
