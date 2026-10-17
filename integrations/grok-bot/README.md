# Dexter for Grok Bot

Use your Dexter Account from Grok Bot. OpenDexter connects the Bot to your
account so it can find services, complete the work you authorize, and show the
result with its cost and receipt. You can also inspect holdings and request
supported asset actions through the same connection.

## Start in Grok Bot

Tell your Bot:

> Install OpenDexter, please. Help me create or connect my Dexter Account,
> then show me what I can do with it.

OpenDexter uses `https://open.dexter.cash/mcp`. Complete the connection on
Dexter's secure page and follow the passkey setup if you are new to Dexter.
Account authorization happens before the connector loads its tools.

Once connected, try a useful task:

- "Find a service that can transcribe this recording. Show me the available
  options and price before purchasing."
- "Show my current cash and holdings, and summarize my recent governed
  transactions."
- For a job you have selected, tell the Bot the result you need and its
  spending limit. It can use a supported paid service when the request and
  account permissions cover the action, then return the delivered work.
- "Prepare a $5 purchase of tokenized Tesla stock and show me the current
  product and terms." Preparation returns present availability and any
  account permission still needed before execution.

These are task prompts, not claims that a particular provider or action is
currently available. The Bot checks the current catalog and action response.
It starts with no scheduled purchases or other routines.

## Create a reusable Bot

[CREATE-BOT.md](CREATE-BOT.md) is the self-contained creation prompt. Paste
its complete contents into Grok Bot, or attach the file and ask the Bot to
create the specified Dexter Bot. It contains the profile and skill, so it
works without access to this repository.

The owner can then create a public template link in Grok Bot. Follow
[PUBLISH.md](PUBLISH.md) to verify the published copy and recipient setup.
A source pack is prepared here; an `x.ai/bot/...` share URL must be recorded
after it is created in the app.

The recipient connects their own Dexter Account. A template carries its
configuration, while financial permissions and credentials remain part of
the recipient's separate connection.

## Maintain the pack

Edit [profile.md](profile.md),
[the Dexter Account skill](skills/dexter-account/SKILL.md), or
[the optional routine](routines.md), then rebuild the creation prompt:

```sh
node integrations/grok-bot/prepare-template.mjs
node integrations/grok-bot/prepare-template.mjs --check
```

Run the anti-slop checker on every changed Markdown file before publishing.
Check the current server instructions and roster when updating tool guidance.
The source at preparation registers fifteen tools; fourteen are model-visible
and `indexter_discover` is reserved for app browsing. The template calls
`indexter_search` for discovery.
