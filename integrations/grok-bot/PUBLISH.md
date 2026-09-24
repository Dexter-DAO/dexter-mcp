# Publish the Dexter Bot template

The official Grok Bot documentation describes creating share links inside
the app. This pack supplies the content for that flow. It contains no
platform-generated template identifier or published share URL.

## Create the Bot

1. Sign in to the intended publisher account in the Grok Bot app.
2. Open a new conversation and provide [CREATE-BOT.md](CREATE-BOT.md). Ask it
   to create the Dexter Bot and save the included `dexter-account` skill.
3. Check Edit Profile against [profile.md](profile.md). Confirm that the
   skill appears in the private skill library and is available to this Bot.
4. Keep routines empty. The optional account-summary instructions are an
   example for a recipient who later asks for a schedule.
5. Finish OpenDexter authorization on the publisher account and perform an
   account read and a discovery request. Preserve the observed results.
   This verifies those flows without authorizing a payment or trade.

Use existing Dexter artwork only if a verified brand asset is available in
the app. An avatar is optional; this pack supplies no replacement logo.

## Create the public link

Open the Bot's Share menu and choose Create template. Select Public link
when choosing visibility. Inspect the template details, then use Copy link.
Record the resulting `https://x.ai/bot/...` URL and publication time in the
launch handoff. Updating source files does not update an already shared Bot;
apply the edits in Grok Bot and use Update template.

Review the template before sharing. Its description, skills and routines must
contain only reusable instructions. Remove account addresses, credentials,
personal files, actual transaction identifiers and private information.
Expect recipients to install and authorize OpenDexter for themselves; do not
assume a custom connector or its credentials will transfer with the template.

## Verify the recipient journey

Open the public link in a separate browser session and confirm the name,
description and Add to Grok Bot action. Then use a separate recipient account:

1. Add the shared Bot and verify its profile and saved skill.
2. Ask it to install OpenDexter and create or connect a Dexter Account.
3. Complete the secure account setup and passkey flow as that recipient.
4. Confirm authenticated tools load, then request an account read and service
   discovery. Check the result against the recipient's own account.
5. Verify that adding the template created no routine, payment or trade.

Record creation, public-link availability, recipient installation, account
setup and authenticated tool use separately. A working public preview alone
does not demonstrate new-account setup. Use a separately authorized task to
verify a purchase or asset action before showing either as completed in a
launch video.

## Official sources

- [Create and share Bots](https://docs.x.ai/grok-bot/bots) describes the
  Share menu, template visibility and recipient copy.
- [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)
  covers the private skill library, schedules and Test run.
- [Computer and apps](https://docs.x.ai/grok-bot/computer-and-apps) describes
  connector authentication and the computer shared by a user's Bots.

Documentation checked September 24, 2026. The official material checked
documents the in-app publication flow; it provides no verified public API
or file format for creating a share URL.
