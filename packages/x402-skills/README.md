# @dexterai/x402-skills

Compose Claude Code skill bundles from x402gle host manifests.

This package generates Anthropic-spec plugin bundles (plugin.json, marketplace.json, SKILL.md, references) from any host's synthesized manifest on x402gle.com. The output is an array of `{ path, content }` files that can be written to disk and installed via `/skill install`.

## Usage

```ts
import { composeSkill } from '@dexterai/x402-skills';

const result = await composeSkill({ hosts: ['blockrun.ai'] });
// result.files: [{ path: 'plugins/blockrun-ai/skills/blockrun-ai/SKILL.md', content: '...' }, ...]
```

## v0 scope

- Single host only (`hosts: [oneHost]`)
- Stateless (`publish: false`)
- Fetches manifests via public HTTP from `x402gle.com`

See `docs/superpowers/specs/2026-05-15-composed-skills-design.md` in the dexter-mcp repo for the full design and v3 roadmap.
