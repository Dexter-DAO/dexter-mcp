# Optional account summary

This template starts with no routines. Once the owner requests a schedule and
supplies a time zone, they can use this instruction:

> At the schedule and time zone I specify, read my Dexter Account's current
> cash and holdings, then summarize new governed actions since the last
> successful summary. Post the result in this conversation. Show stale or
> unavailable data explicitly and preserve the last successful checkpoint
> until the next read succeeds. Never purchase, trade, send funds, reconcile a
> transaction, or send an external message as part of this routine.

Use `dexter_wallet`, `dexter_wallet_portfolio` and `dexter_wallet_history`.
Follow server-issued history cursors. Call history "governed action history"
rather than claiming it includes every service payment. An expired work report
does not establish that an agent stopped or finished.

Confirm the selected schedule and next run in Grok Bot. Use its Test run
control after creation; that run performs the requested account reads. If
authorization expires, pause the summary and ask the owner to reconnect.
