# Apps SDK capability refresh — 2026-07-25 (pre-sweep scout)

Read before designing/building any renderer restyle, and before the OpenAI
submission scan. Produced by a docs-vs-code diff agent (full doc URLs at
bottom); the sweep (#95 restyle arc) and the #94 submission both consume this.

## USE THESE (capabilities we're not using)

- **Host design tokens (biggest win).** Since 2026-05-28 hosts push standardized
  CSS variables (`hostContext.styles.variables` on `ui/initialize`, re-pushed on
  `ui/notifications/host-context-changed`): `--color-background-*`, `--color-text-*`,
  `--color-border-*`, `--font-sans/--font-mono`, `--font-text-*`/`--font-heading-*`,
  `--border-radius-*`, `--shadow-*`. Our bridge reads only `hostContext.theme`
  and never subscribes to host-context-changed (adapter.ts:60). Restyle rule:
  build the four faces on these variables WITH fallbacks → ChatGPT light/dark
  + Claude chrome tracking for free. SDK helpers exist
  (`useHostStyleVariables`, `useDocumentTheme`).
- **Host-provided fonts** (`hostContext.styles.css.fonts`) — the sanctioned
  typography path; ChatGPT guidelines BAN custom fonts even fullscreen.
- **containerDimensions** — height AND width, fixed vs flexible; we read only
  `maxHeight`.
- **Display modes are self-locked-out:** mcp-apps-bridge.ts:133 declares
  `availableDisplayModes: ['inline']`; hosts MUST NOT switch to undeclared
  modes → fullscreen/pip unreachable on every MCP-Apps host even though some
  entries call `requestDisplayMode` on the ChatGPT path. One-line unlock:
  declare `['inline','fullscreen']` (+ 'pip' where it fits). The search
  drawer + fetch-result JSON views are the natural fullscreen customers.
- Unused ChatGPT extensions: `requestModal`, `requestClose`,
  `setOpenInAppUrl`, `window.openai.view`, `safeArea`, `locale` (typed but
  unconsumed).
- **Widget state persistence** (`setWidgetState` w/ `{modelContent,
  privateContent, imageIds}`) and `sendFollowUpMessage` — debug-panel-only
  today; card theme choice, open sheet, selections should persist.
- `ui/download-file` — the ONLY export path (iframe `allow-downloads` off);
  receipts/CSV.
- `_meta.ui.permissions` — we declare none; `clipboardWrite` matters for the
  copy-address buttons.
- CSP grammar additions: `frameDomains` (review tripwire — avoid),
  `baseUriDomains`.
- Decoupled data-tools vs render-tools (avoid iframe remount per call).
- `_meta["openai/widgetSessionId"]` on tool-result `_meta` — stable instance
  id for log correlation.

## FIX THESE (deprecated / wrong today)

- Flat `_meta["ui/resourceUri"]` — DEPRECATED, "removed before GA". Keep
  nested `_meta.ui.resourceUri` (we emit both; plan the flat one's removal).
- `openai/widgetCSP` is legacy — new form `_meta.ui.csp {connectDomains,
  resourceDomains, frameDomains, baseUriDomains}` — **EXCEPT
  `redirect_domains` exists ONLY on the legacy key and is still required for
  trusted `openExternal` destinations. WE SET NONE → every openExternal
  target (dexter.cash/wallet etc.) is unallowlisted today. Add
  redirect_domains to the shared CSP builder BEFORE the submission scan.**
- `openai/resultCanProduceWidget` — dead key (zero doc occurrences). Drop.
- `openai/widgetAccessible` → prefer `_meta.ui.visibility: ["model","app"]`;
  `openai/widgetPrefersBorder` → `_meta.ui.prefersBorder`;
  `openai/widgetDomain` → `_meta.ui.domain` (**ui.domain REQUIRED for
  submission**, unique per plugin).
- **BUG: `ui/update-model-context` sent as a NOTIFICATION with `{text}`**
  (mcp-apps-bridge.ts:242-244); spec = REQUEST with
  `params:{content?: ContentBlock[], structuredContent?}`. Hosts drop ours.
- **BUG/drift: resource-level keys on TOOL descriptors** in
  `toolsets/widgetMeta.mjs:71-86` (widgetDomain/CSP/prefersBorder belong on
  the RESOURCE — register.mjs does it right). Worse: widgetMeta.mjs (16
  authed-server toolsets) emits NO `ui.resourceUri` at all — only
  `openai/outputTemplate` → those widgets render in ChatGPT and nowhere
  else. Same repo, two dialects — Rule-7 cleanup when touched.
- `text/html;profile=mcp-app` MIME — already correct via ext-apps.

## SUBMISSION TRIPWIRES (for #94)

- The scan snapshot FREEZES tool metadata + linked resource metadata
  INCLUDING CSP; changing any of it = deploy → new draft → rescan → review →
  publish. Same-URI content updates skip review but ChatGPT caches resource
  contents up to 1 HOUR. Never break a published resource URI (rollback,
  don't wait on review). Changing server origin = entirely new plugin.
- Domain verification: token at `/.well-known/openai-apps-challenge` on the
  MCP host, then Verify Domain.
- **Response minimization is an explicit rejection reason**: no session IDs,
  trace IDs, timestamps, logging metadata in tool responses unless strictly
  required — our x402 tools' diagnostic fields need a pass.
- Annotations (`readOnlyHint`/`openWorldHint`/`destructiveHint`) mandatory on
  EVERY tool + justifications. Screenshots: only with a scanned UI template;
  exactly 706px wide, 400–860px tall, one per starter prompt. 5 positive + 3
  negative test cases, demo recording, HTTPS site/support/privacy/terms
  ≤1024 chars, name ≤30 chars, ≤3 starter prompts ≤128 chars, brand hexes
  ≥2:1 contrast vs white AND #212121. EU-data-residency projects cannot
  submit MCP plugins.

## Doc URLs
- developers.openai.com/apps-sdk/reference (= /plugins/reference.md)
- developers.openai.com/plugins/build/chatgpt-ui.md
- developers.openai.com/plugins/concepts/ui-guidelines.md
- developers.openai.com/plugins/deploy/app-review.md
- developers.openai.com/plugins/deploy/submission-errors.md
- developers.openai.com/plugins/app-guidelines.md
- developers.openai.com/plugins/changelog
- modelcontextprotocol.io/docs/extensions/apps
- github.com/modelcontextprotocol/ext-apps · specification/draft/apps.mdx
