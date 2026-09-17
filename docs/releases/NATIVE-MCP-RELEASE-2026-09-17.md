# Native MCP release: 17 September 2026

The backend release owner applies the four reviewed database migrations and
accepts API `33ffd350e3ceb6ac6cd36ec48ebcf1552a4872dd` with Facilitator
`03f2bcb2e3b273fec116b004101105ec68bbf365` before the MCP receipt refresh.
Record the actual backend readbacks first. This document prepares the commands;
the checked-in acceptance receipt changes only after those releases are accepted.

The API governed baseline is tree `557ff0e749ab41157b01cb18fd6f6593fb8689a1`.
The successor Facilitator tree is `dafca894965d919f3714dd10b8cb9a170dbb319b`.
Its current binding fixture matches the API fixture at SHA256
`54b23f1650bf0b65861f4c7dbe9594cd1a4ea752915819792d7ae8d14d362848`.
The historical API fixture remains bound to its original bytes.

## Refresh and review

Run from the root-owned MCP worktree. Keep the existing prepared source changes.

```bash
cd /home/branchmanager/worktrees/dexter-mcp-native-buyer-20260916
export PATH="/opt/dexter/runtime/node-v22.19.0/bin:$PATH"
MCP_NODE=/opt/dexter/runtime/node-v22.19.0/bin/node
MCP_NPM=/opt/dexter/runtime/node-v22.19.0/lib/node_modules/npm/bin/npm-cli.js
export OPENDEXTER_API_SOURCE_ROOT=/home/branchmanager/worktrees/dexter-api-native-mcp-buyer-20260916
export OPENDEXTER_FACILITATOR_SOURCE_ROOT=/home/branchmanager/worktrees/dexter-facilitator-vault0434-20260916
"$MCP_NODE" --version
"$MCP_NODE" "$MCP_NPM" --version
```

These must report Node `v22.19.0` and npm `10.9.3`. Preserve the existing approved
GitHub credential environment for private source verification; keep credentials
out of command output and evidence files.

After the backend owner's accepted readbacks:

```bash
"$MCP_NODE" "$MCP_NPM" run prepare:open-accepted-production
"$MCP_NODE" --test \
  tests/open-accepted-production-receipt.test.mjs \
  tests/open-source-contracts.test.mjs \
  tests/open-source-contracts-sdk-cohorts.test.mjs \
  tests/open-tool-descriptors.test.mjs \
  tests/native-mcp-hosted.test.mjs \
  tests/open-tool-contracts.test.mjs \
  tests/open-tool-auth.test.mjs \
  tests/x402-money-boundary.test.mjs \
  tests/wallet-activity.test.mjs
"$MCP_NODE" "$MCP_NPM" run build:runtime-workspaces
"$MCP_NODE" "$MCP_NPM" run typecheck:open-release
git diff --check
```

Review all three generated files under `release/`. Their API and Facilitator
identities must match the accepted readbacks. The public descriptor must contain
14 registered tools, with 13 visible to the model, and retain Wallet Activity V4.
Commit and push the reviewed source, fixtures, tests and generated files together.

The following checks require a clean, pushed commit. They install and build a
bounded archive using the committed dependency graph:

```bash
"$MCP_NODE" "$MCP_NPM" run generate:open-tool-descriptors
```

If archive finalization changes the descriptor, review that exact diff, commit
and push it, then verify the resulting clean commit:

```bash
"$MCP_NODE" "$MCP_NPM" run verify:open-tool-descriptors
```

Merge PR 86 after these checks. Move the root-owned release checkout to the
merged commit, confirm its tree matches the reviewed source, and repeat the
descriptor and backend-source verification for that final commit. Retain the proof and command output.

## Build and activate

The release owner builds from the final clean, pushed commit:

```bash
"$MCP_NODE" scripts/release/build-open-release.mjs \
  --output-root /var/lib/dexter-mcp/releases --revision HEAD
```

Keep the returned release directory and external file manifest. The builder
installs the pinned graph, finalizes runtime workspaces and widget assets,
checks the committed descriptor, and seals both public and private rosters.

Set `MCP_RELEASE_DIR` to the exact returned directory. Set `DEXTER_MCP_ENV_FILE`
to the release owner's reviewed absolute environment-file path. The activation
helper requires an owned mode-0600 regular file with one link. Its private roster
overrides must be empty, and its native purchase HMAC configuration must match
the accepted API.

Root performs the two activations sequentially:

```bash
"$MCP_NODE" "$MCP_RELEASE_DIR/scripts/release/activate-open-release.mjs"
"$MCP_NODE" "$MCP_RELEASE_DIR/scripts/release/activate-private-release.mjs"
```

The public helper publishes immutable widget assets, verifies their public URLs,
and proves preservation of private MCP. After public acceptance, the private
helper proves preservation of the public process while replacing private MCP.
Each helper checks running identities, rosters and saved PM2 state, and retains
rollback evidence. Record both resulting service identities and health responses.
Keep the root-owned source worktree until its owner closes the release handoff.
