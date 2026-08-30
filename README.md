# ApproveDeck

**Mission control for TrueForge approvals.**

Agent harnesses stop and wait for a human before anything irreversible. But
the human is buried in a chat transcript. When you run five agents, the
approval that matters is three tabs deep and forty messages up.

ApproveDeck is a dedicated approval surface for
[TrueForge](https://github.com/truefoundry/trueforge). One screen:

- **Needs a human**: every `tool.approval_required` gate across every
  session, as a card: which agent, which tool, the exact payload, how long
  it has been waiting. Destructive tools glow red and pulse.
- **Approve / Deny**: one click resolves the gate straight through the
  TrueForge API (`user.tool_approval` turn input). The agent resumes
  immediately.
- **Open questions**: `ask_user_question` events surface alongside, so you
  see everything blocked on you, not just approvals.
- **Agent sessions**: a live rail of all sessions with status, recent tool
  calls, and token spend.

## Why this matters

The harness's approval gate is only as good as the human's response time.
A gate nobody sees is a gate that silently stalls the agent, or worse, gets
rubber-stamped later without reading. ApproveDeck makes the human-in-the-loop
step a first-class surface: visible, contextual, and fast.

## Run it

```bash
# TrueForge running locally on :8790
npx @truefoundry/trueforge

# ApproveDeck
npm install
npm run dev     # http://localhost:5199 (proxies /api -> localhost:8790)
```

## How it works

- Polls `GET /api/v1/sessions`, walks each session's latest turn, and reads
  `state.required_actions` for pending gates.
- Correlates each pending `tool_call_id` with the turn's event stream to
  recover the tool name and full arguments (streamed argument deltas are
  reassembled client-side).
- MCP calls through TrueForge's `call_tool` wrapper are unwrapped so the card
  shows the real tool (`execute_approved_operation (saferun-db)`), not the
  wrapper.
- Decisions POST a `user.tool_approval` input to `/sessions/:id/turns`.

No mocks: every card on screen is a real gate in a real running harness.

## Design

Raycast-inspired dark system: near-black canvas (#07080a), hairline borders,
Inter with ss03, accent colors reserved for state (red = waiting on you,
green = approve, blue = running).
