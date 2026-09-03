import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('passkey onboarding uses the Wallet identity and preserves wallet truth', async () => {
  const [entry, css] = await Promise.all([
    source('apps-sdk/ui/src/entries/passkey-onboard.tsx'),
    source('apps-sdk/ui/src/styles/widgets/passkey-onboard.css'),
  ]);

  assert.match(entry, /import \{ Lockup \} from '\.\.\/components\/wallet\/Lockup'/);
  assert.match(entry, /<Lockup width=\{132\} \/>/);
  assert.match(entry, /useToolOutput<PasskeyPayload>/);
  assert.match(entry, /vault_status === 'authentication_required'/);
  assert.match(entry, /vault_status === 'error'/);
  assert.match(entry, /vault_status === 'ready'/);
  assert.match(entry, /payload\.receive_address \|\| payload\.vault_address \|\| ''/);
  assert.match(entry, /This response did not include a receive address/);
  assert.match(entry, /navigator\.clipboard\.writeText\(value\)/);
  assert.match(entry, /openLink\('https:\/\/dexter\.cash\/wallet'\)/);
  assert.match(entry, /https:\/\/solscan\.io\/account\/\$\{receiveAddress\}/);
  assert.match(entry, /Use the host's Connect control/);
  assert.match(entry, /useAdaptiveTheme/);
  assert.match(entry, /useIntrinsicHeight/);
  assert.doesNotMatch(entry, /style=\{maxHeight|overflowY:\s*'auto'/);

  assert.doesNotMatch(
    entry,
    /WORDMARK_URL|<img|DexterLoading|Confetti|LinkGlyph|CheckGlyph|ErrorGlyph|eyebrow|status-dot|dx-passkey__disc/,
  );
  assert.match(css, /\.dx-passkey\s*\{[^}]*background:\s*transparent/s);
  assert.doesNotMatch(css.match(/\.dx-passkey\s*\{[^}]*\}/s)?.[0] ?? '', /overflow(?:-[xy])?:\s*auto/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient|border[^;]*dashed/);
  assert.doesNotMatch(css, /border-radius:\s*(?:999|50%)|--dx-radius-pill/);
});

test('passkey probe keeps all four diagnostics without the nested-card treatment', async () => {
  const [entry, css] = await Promise.all([
    source('apps-sdk/ui/src/entries/passkey-probe.tsx'),
    source('apps-sdk/ui/src/styles/widgets/passkey-probe.css'),
  ]);

  assert.match(entry, /navigator\.credentials\.create\(/);
  assert.match(entry, /navigator\.credentials\.get\(/);
  assert.match(entry, /window\.open\(target/);
  assert.match(entry, /openLinkProbe\(target\)/);
  assert.match(entry, /webauthnProbeTelemetryEnabled !== true/);
  assert.match(entry, /Passkey capability probe/);
  assert.match(entry, /WebAuthn ceremony/);
  assert.match(entry, /Scripted popup/);
  assert.match(entry, /Direct anchor/);
  assert.match(entry, /Host-mediated link/);
  assert.match(entry, /useAdaptiveTheme/);
  assert.match(entry, /useIntrinsicHeight/);
  assert.match(entry, /useAdaptiveRequestDisplayMode/);
  assert.match(entry, /Open all checks/);
  assert.doesNotMatch(entry, /style=\{maxHeight|overflowY:\s*'auto'/);
  assert.match(entry, /aria-busy=\{running\}/);
  assert.doesNotMatch(entry, /passkey-probe-card|passkey-probe-eyebrow/);
  assert.doesNotMatch(entry, /style=\{\{\s*marginTop/);

  assert.match(css, /\.passkey-probe-container\s*\{[^}]*background:\s*transparent/s);
  assert.doesNotMatch(css.match(/\.passkey-probe-container\s*\{[^}]*\}/s)?.[0] ?? '', /overflow(?:-[xy])?:\s*auto/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /\.passkey-probe-button\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.doesNotMatch(css, /\.passkey-probe-card|\.passkey-probe-eyebrow/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}|rgba?\(/i);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient|border[^;]*dashed/);
  assert.doesNotMatch(css, /border-radius:\s*(?:999|50%)|--dx-radius-pill/);
});

test('passkey documents still mount their dedicated entries', async () => {
  const [onboard, probe] = await Promise.all([
    source('apps-sdk/ui/passkey-onboard.html'),
    source('apps-sdk/ui/passkey-probe.html'),
  ]);

  assert.match(onboard, /id="passkey-onboard-root"/);
  assert.match(onboard, /src="\.\/src\/entries\/passkey-onboard\.tsx"/);
  assert.match(probe, /id="passkey-probe-root"/);
  assert.match(probe, /src="\.\/src\/entries\/passkey-probe\.tsx"/);
});
