# OpenDexter task completion and readable results

The candidate keeps the customer request through discovery, authorization, execution and recovery. Existing task authorization and active permissions carry through ordinary tool calls; the agent asks for a missing consequential decision. Runtime spending and permission enforcement are unchanged.

Trade responses use verified receipt quantities and proceeds, with exact raw evidence preserved. Historical scaled quantities stay unknown where the receipt lacks observation-time evidence. Purchase responses lead with delivered provider content and distinguish delivery from payment confirmation. Portfolio text gives readable holdings while retaining the complete structured result. Saved-check recovery observes the original request and never probes the provider again.

The API producer is dexter-api PR299, source 79c54bfd9b6cfb65c0f4fb0ff3fac80dbee4280d. This MCP consumer accepts prior API results without receiptOutcome. Deploy the reviewed consumer against the accepted API/FAC pair before switching the API producer. Until that switch, saved-check recovery reports that the capability is unavailable. It must not fall back to another check.

Validation includes real MCP handler and installed-SDK response boundaries, saved sale and purchase economics, differing mint precision, historical scaling gaps, exact small charges, permission handoffs, contextual discovery, temporary read failures and uncertain dispatch. The historical response envelope around the sale fixture is synthetic; the debit and proceeds come from the saved finalized transaction. No financial action is part of this candidate qualification.

Payments owns deployment. Plugin contract refresh follows the accepted public MCP release. Human sell amount inputs, signing support, additional Send support and a permission-management capability remain separate work.
