import { readFile, writeFile } from 'node:fs/promises';

const base = new URL('./', import.meta.url);
const files = ['profile.md', 'skills/dexter-account/SKILL.md', 'routines.md'];
const [profile, skill, routines] = await Promise.all(
  files.map((name) => readFile(new URL(name, base), 'utf8')),
);
const fence = String.fromCharCode(96).repeat(4);
const output = `# Create the Dexter Bot

Create a Grok Bot named Dexter using the profile below. Save the complete
included skill as a private skill named dexter-account and make it available
to that Bot. Keep the skill's instructions intact. If those app actions need
me, show the exact step I should take and preserve the supplied content.

Begin with no routines enabled. The optional routine below is an example for
later use when I request a schedule and time zone. This creation request
authorizes Bot configuration only; it does not request a purchase, trade,
fund transfer, external message, or public template publication.

After creation, confirm which profile and skill were saved and let me choose
my first task. When I ask to connect, install OpenDexter at
https://open.dexter.cash/mcp and use the native authorization flow. I will
complete Dexter Account setup and any passkey step through the secure page.
Keep account credentials and personal transaction details out of reusable
profile and skill text.

## Profile to save

${profile.trim()}

## Complete skill to save

${fence}markdown
${skill.trim()}
${fence}

## Optional routine instructions

${routines.trim()}
`;

const target = new URL('CREATE-BOT.md', base);
if (process.argv.includes('--check')) {
  const actual = await readFile(target, 'utf8').catch(() => null);
  if (actual !== output) {
    console.error('CREATE-BOT.md is missing or stale. Run prepare-template.mjs.');
    process.exitCode = 1;
  } else {
    console.log('CREATE-BOT.md matches the profile, skill and routine sources.');
  }
} else {
  await writeFile(target, output);
  console.log('Prepared integrations/grok-bot/CREATE-BOT.md.');
}
