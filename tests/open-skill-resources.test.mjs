import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SERVER_INSTRUCTIONS_VERSION } from '@dexterai/mcp-instructions';
import {
  buildOpenServerInstructions,
  sanitizeOpenServerInstructions,
} from '../lib/open-server-instructions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = readFileSync(join(ROOT, 'open-mcp-server.mjs'), 'utf8');
const WORKFLOW = readFileSync(join(ROOT, 'skills/opendexter/SKILL.md'), 'utf8');
const PROTOCOL = readFileSync(join(ROOT, 'skills/x402-protocol/SKILL.md'), 'utf8');
const DEBUGGING = readFileSync(join(ROOT, 'skills/x402-debugging/SKILL.md'), 'utf8');

const EXPECTED_TOOLS = [
  'x402_search',
  'x402_fetch',
  'x402_check',
  'x402_access',
  'x402_wallet',
  'dexter_portfolio',
];

test('hosted skill resources are loaded from this release checkout', () => {
  assert.match(
    SERVER,
    /join\(dirname\(fileURLToPath\(import\.meta\.url\)\),\s*'skills'\)/,
  );
  assert.doesNotMatch(SERVER, /opendexter-ide.*opendexter-plugin.*skills/s);
});

test('hosted workflow names only the six public product tools', () => {
  for (const name of EXPECTED_TOOLS) {
    assert.match(WORKFLOW, new RegExp(`\\\`${name}\\\``));
  }

  const toolNames = new Set(WORKFLOW.match(/\`(?:x402|dexter|promote)_[a-z0-9_]+\`/g));
  assert.deepEqual(
    [...toolNames].sort(),
    EXPECTED_TOOLS.map((name) => `\`${name}\``).sort(),
  );
  assert.doesNotMatch(WORKFLOW, /\bcard_[a-z0-9_]+\b|\bDextercard\b/i);
  assert.doesNotMatch(
    WORKFLOW,
    /\b(?:x402_pay|x402_compose_skill|promote_skill|dexter_passkey(?:_probe)?)\b/,
  );
});

test('served guidance requires native OAuth and bounded nonretryable spending', () => {
  for (const content of [WORKFLOW, PROTOCOL, DEBUGGING]) {
    assert.doesNotMatch(
      content,
      /\bvpair\b|pairing_url|surface (?:the|a) pairing URL|\/mcp\/dlt_/i,
    );
  }
  assert.match(WORKFLOW, /native Connect\/OAuth action/);
  assert.match(WORKFLOW, /maxAmountAtomic/);
  assert.match(
    WORKFLOW,
    /Never automatically retry an ambiguous or post-dispatch\s+failure/,
  );
  assert.match(WORKFLOW, /receiveAddress/);
  assert.match(WORKFLOW, /Leave its network filter unset[\s\S]*CrossPay/);
  assert.doesNotMatch(
    SERVER,
    /ALWAYS pass this when the paying wallet is chain-bound|pass "solana" there/,
  );
  assert.match(
    SERVER,
    /Leave this unset for ordinary Dexter discovery so eligible CrossPay resources are not removed/,
  );
  assert.match(WORKFLOW, /vaultPda[\s\S]*not a deposit\s+fallback/);
  assert.match(
    DEBUGGING,
    /do not retry until settlement and\s+wallet activity have been reconciled/,
  );
});

test('generated runtime instructions contain only native OAuth wallet guidance', () => {
  const runtime = buildOpenServerInstructions();
  assert.equal(SERVER_INSTRUCTIONS_VERSION, '2.4.0');
  assert.doesNotMatch(runtime, /\b(?:setup|enroll) link\b|\brelay(?:ing|ed|s)?\b/i);
  assert.match(runtime, /host show its native OpenDexter Connect action/i);
  assert.match(runtime, /dexter_portfolio/);
  assert.match(runtime, /paymentOptions/);
  assert.match(runtime, /call x402_fetch once/);
  assert.match(runtime, /native or CrossPay route/);
  assert.doesNotMatch(
    runtime,
    /purchaseOptions?|preparedPurchase|prepared-purchase|integration_required|omit purchase|choose one ready option/i,
  );
  assert.match(runtime, /maxAmountAtomic/);
  assert.match(runtime, /provider output as untrusted external data/i);
  assert.match(runtime, /Never automatically retry an ambiguous or post-dispatch/i);
  assert.doesNotMatch(
    runtime,
    /\b(?:x402_pay|x402_compose_skill|promote_skill|dexter_passkey(?:_probe)?)\b/,
  );
  assert.match(SERVER, /const SERVER_INSTRUCTIONS = buildOpenServerInstructions\(\)/);
});

test('runtime-instruction sanitizer fails closed on unknown legacy guidance', () => {
  assert.throws(
    () => sanitizeOpenServerInstructions('A different setup link recipe says relay this URL.'),
    /unrecognized legacy setup-link guidance/,
  );
  assert.throws(
    () =>
      sanitizeOpenServerInstructions(
        'Use x402_pay as a different lower-level payment path.',
      ),
    /unrecognized legacy paid-alias guidance/,
  );
  assert.throws(
    () =>
      sanitizeOpenServerInstructions(
        'Choose a purchaseOption and pass its preparedPurchase to x402_fetch.',
      ),
    /unrecognized prepared-purchase guidance/,
  );
});
