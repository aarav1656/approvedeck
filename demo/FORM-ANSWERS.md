# ApproveDeck submission form answers (aarav1656)

## Project name

ApproveDeck

## One-liner

Mission control for TrueForge approvals: every agent waiting on a human, across every session, in one keyboard-driven deck, with hold-to-arm safety for destructive tools.

## Repo

https://github.com/aarav1656/approvedeck

## Demo video

https://files.catbox.moe/od6dtw.mp4

## What it does

TrueForge agent harnesses pause before anything irreversible. ApproveDeck is the operator surface for that pause: instead of watching one chat tab per agent, you see every `tool.approval_required` gate across all sessions in a single approval deck.

Each card shows: the agent, the session, the exact MCP tool name, the full JSON payload, and how long the agent has been waiting. Destructive tools (matched on tool name and payload arguments) get a red pulse border, focus-dim, and a mandatory 650 ms hold-to-arm gate so accidental approvals are impossible.

The deck is keyboard-first: `j`/`k` navigate, `Enter` approves (hold for destructive), `d` opens a deny-reason chip set (`wrong env` / `too broad` / `needs human` / `policy`) plus free text. A decision log in the sidebar tracks approve/deny counts and median response time.

## How it uses TrueForge

ApproveDeck talks exclusively to the TrueForge REST API. No mocks, no fakes.

Poll loop (2 s interval):
- `GET /sessions` -- list all sessions
- `GET /sessions/:id/turns` -- read turns per session
- Find turns where `required_actions` contains a `tool.approval_required` event; surface as a card

Approve action:
- `POST /sessions/:id/turns` with `{ "input": { "type": "user.tool_approval", "approved": true } }`

Deny action:
- `POST /sessions/:id/turns` with `{ "input": { "type": "user.tool_approval", "approved": false, "reason": "..." } }`

Verified end to end: a real SafeRun database-guardian agent hit its `execute_approved_operation` gate, the card appeared in ApproveDeck, Approve was clicked in this UI, and the operation ran against a live Postgres database (23 payments deleted, sandbox-verified rollback on file). Screenshots in the repo are from that run.

## AI use disclosure

AI coding assistants (Cursor, Claude) were used throughout development. All generated code was reviewed, understood, and tested before merging. Every substantive PR went through a Qodo review cycle; commit `46bcd60` resolves the 6 bugs that review surfaced.
