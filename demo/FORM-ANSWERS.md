# ApproveDeck submission form answers (aarav1656)

## Project name
ApproveDeck

## One-liner
Mission control for TrueForge approvals: every agent waiting on a human,
across every session, in one deck, with one-click Approve/Deny that resumes
the agent through the harness API.

## Repo
https://github.com/aarav1656/approvedeck

## What it does / how it uses TrueForge
Agent harnesses stop before anything irreversible: that is the point. But the
human side of that contract is underserved: with several sessions running,
an approval gate fires in a chat tab you are not looking at, and the agent
sits blocked.

ApproveDeck is a dedicated approval surface built entirely on the TrueForge
REST API:

- Polls /sessions, /turns and /events and surfaces every
  tool.approval_required pause across all sessions as a card: agent, session,
  the exact MCP tool and its full JSON payload, and wait time. Destructive
  tools (execute/delete/drop) get a red pulse.
- One-click Approve/Deny posts a user.tool_approval turn input back to the
  session; the agent resumes immediately. Deny carries a reason.
- Fleet sidebar: every session with live status (running/waiting/idle/error),
  recent tool calls, token spend.
- ask_user_question pauses surface too, so everything blocked on a human is
  in one place.

Verified end to end with no mocks: a real database-guardian agent hit its
approval gate, the card appeared, we clicked Approve in ApproveDeck, and the
operation executed against a live Postgres database with a sandbox-verified
rollback on file. Screenshots in the repo are from that run.

Design: Raycast-style dark system (near-black canvas, hairline borders,
Inter ss03), tokens in Tailwind v4 @theme, accents reserved for meaning
(red = waiting on you, green = approve, blue = running).

## AI use disclosure
AI coding assistants were used throughout; all code is understood and
explainable. PRs reviewed via Qodo.
