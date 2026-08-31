# Why I built a separate screen just for approving agent actions

## Upload checklist

Upload these in this order. Each one replaces the matching
`[IMAGE: ...]` line in the body below.

1. `docs/blog-assets/hero-approval-gate.png`
   caption: One gate waiting, eight sessions running. The count in the header is the only number I check before deciding whether to look at this screen at all.
2. `docs/blog-assets/gate-card.png`
   caption: Everything a decision needs, in the order I need it: which agent, how bad it could be, what it wants to run, and how long it has been waiting. The red pill appears only on the destructive path, so a card without one is a card I can clear with Enter.
3. `docs/blog-assets/keyboard-map.png`
   caption: The map lives in the header rather than behind a help key. Keycap chrome on j/k, Enter, d and Esc is doing the work a legend would otherwise do.
4. `docs/blog-assets/hold-to-arm.gif`
   caption: Seven frames from the demo capture, at the rate the fill actually moves. The fill is the only progress indicator, and it runs backwards to empty the moment you release early.
5. `docs/blog-assets/hold-to-approve-button.png`
   caption: Caught partway through the hold. Deny sits beside it at the same size, so neither option is the one the layout is nudging you toward.
6. `docs/blog-assets/destructive-path.png`
   caption: Either match sends the gate down the destructive path. The deny side has its own gate: on a destructive card the deny button stays disabled until a reason chip is picked, so a denial always carries why.
7. `docs/blog-assets/gate-roundtrip.png`
   caption: The round trip. Two steps in the middle are the ones that cost me the afternoon: reassembling the deltas, and unwrapping the envelope.
8. `docs/blog-assets/payload-expanded.png`
   caption: What that reassembly buys you. `run_sql` is the unwrapped name, and the statement, the target database and the 23 rows it estimates are all visible before the decision rather than after it.
9. `docs/blog-assets/chain-of-custody.png`
   caption: 55 events on one session, one of them a gate. The durations are the reason this is worth having: a 1.3s `exec` next to a 5ms one tells you where the run went, and the failed turn at 07:09:03 is on the same spine as everything else.
10. `docs/blog-assets/decision-log.png`
   caption: Approved, denied, approve rate, and the wait on each decision. The 2s is how long that gate sat before I answered it, which is the figure I actually want to watch drift.
11. `docs/blog-assets/mobile-390.png`
   caption: 390px after the fix. The payload block wraps instead of pushing the page sideways, and the two buttons stay side by side rather than stacking.
12. `docs/blog-assets/session-rail.png`
   caption: The session rail is deliberately the quietest column on the screen. One session is waiting and carries the only accent in the list. The other seven report their token counts and last tool and otherwise stay out of the way.

Both diagrams are also checked in as mermaid source next to the
PNGs (`docs/blog-assets/gate-roundtrip.mmd` and
`docs/blog-assets/destructive-path.mmd`) for later edits.

---

The approval gate is the most important moment in an agent run and it usually
shows up as a line of text somewhere in a chat log, sandwiched between the
model narrating its plan and the model narrating its plan again. You are meant
to read a JSON payload rendered inline, decide whether it is safe, and click
something. I kept catching myself skimming.

[IMAGE: docs/blog-assets/hero-approval-gate.png - One gate waiting, eight sessions running. The count in the header is the only number I check before deciding whether to look at this screen at all.]

So ApproveDeck is one screen and only one screen. Every pending gate across
every session, with the agent that raised it, the MCP tool name unwrapped out
of its envelope, the exact JSON arguments, and how long that gate has been
sitting there waiting for a human. Nothing else competes for the space.

[IMAGE: docs/blog-assets/gate-card.png - Everything a decision needs, in the order I need it: which agent, how bad it could be, what it wants to run, and how long it has been waiting. The red pill appears only on the destructive path, so a card without one is a card I can clear with Enter.]

## A chat transcript against the deck

| | Chat transcript | The deck |
| --- | --- | --- |
| Where gates live | inline, between two blocks of model narration | one queue, nothing else on the screen |
| Tool name | the `call_tool` envelope | the real tool, unwrapped |
| Arguments | rendered inline, sometimes `{}` while deltas are still arriving | reassembled across deltas, shown in full |
| Multiple sessions | one transcript per session, opened one at a time | every pending gate from every session at once |
| Waiting time | not shown | on every card |
| Approving | click, whatever the tool does | Enter, or a 650ms hold on the destructive path |
| After the fact | scroll back through the log | decision log with counts and response latency |

## The keyboard is the interface

j and k move down and up the queue, Enter approves, d opens the deny reason
chips, Esc clears whatever state you are in. That is the whole map, and after
about twenty minutes of using it I stopped looking at the screen when moving
between items.

[IMAGE: docs/blog-assets/keyboard-map.png - The map lives in the header rather than behind a help key. Keycap chrome on j/k, Enter, d and Esc is doing the work a legend would otherwise do.]

Destructive tools do not get Enter. They get a 650ms hold to arm: press and
keep pressing, watch the ring fill, and if you let go early nothing is posted.
No modal, no typing DELETE into a box to prove you meant it. I picked 650ms by
holding a few different durations and noticing where my thumb stopped being
able to do it accidentally. 400 felt like a normal click. A full second felt
like being punished.

[IMAGE: docs/blog-assets/hold-to-arm.gif - Seven frames from the demo capture, at the rate the fill actually moves. The fill is the only progress indicator, and it runs backwards to empty the moment you release early.]

[IMAGE: docs/blog-assets/hold-to-approve-button.png - Caught partway through the hold. Deny sits beside it at the same size, so neither option is the one the layout is nudging you toward.]

The reason this matters is that a confirm dialog trains you to dismiss it. A
hold does not, because there is no muscle memory for holding a key down that
you can execute while thinking about something else.

Which path a gate takes is decided on the tool name and on the arguments, not
on the name alone.

[IMAGE: docs/blog-assets/destructive-path.png - Either match sends the gate down the destructive path. The deny side has its own gate: on a destructive card the deny button stays disabled until a reason chip is picked, so a denial always carries why.]

## Getting the gates out of the harness

There is no approvals endpoint, which surprised me for about an hour and then
stopped mattering. The deck polls `GET /api/v1/sessions`, reads
`state.required_actions` on each one, and assembles the picture from that.

[IMAGE: docs/blog-assets/gate-roundtrip.png - The round trip. Two steps in the middle are the ones that cost me the afternoon: reassembling the deltas, and unwrapping the envelope.]

The interesting part is the tool call arguments. They arrive streamed, and the
call id shows up on the first delta while the arguments come through as later
chunks, so a naive read gives you a tool call with an id and an empty argument
object. I lost a chunk of an afternoon to gates that rendered with `{}` as the
payload before I understood the shape of it. The fix is to reassemble across
deltas keyed on that id, then unwrap the `call_tool` envelope to get at the
real tool underneath, because the outer name is always `call_tool` and tells
you nothing about whether you are about to approve a read or a drop.

[IMAGE: docs/blog-assets/payload-expanded.png - What that reassembly buys you. `run_sql` is the unwrapped name, and the statement, the target database and the 23 rows it estimates are all visible before the decision rather than after it.]

Resolving a gate is a `user.tool_approval` turn posted back to the session.
Once that lands, the agent picks up mid turn and keeps going.

Two more surfaces sit on top of the same event data. The chain of custody
timeline is a per session spine built from real harness events with durations
attached, so you can see where the run actually spent its time rather than
where you assume it did.

[IMAGE: docs/blog-assets/chain-of-custody.png - 55 events on one session, one of them a gate. The durations are the reason this is worth having: a 1.3s `exec` next to a 5ms one tells you where the run went, and the failed turn at 07:09:03 is on the same spine as everything else.]

The decision log counts approvals and denials and tracks response latency,
which is the number I expect to get worse over a long session and wanted
visible rather than guessed at.

[IMAGE: docs/blog-assets/decision-log.png - Approved, denied, approve rate, and the wait on each decision. The 2s is how long that gate sat before I answered it, which is the figure I actually want to watch drift.]

## The run that made it feel finished

A database agent hit a gate mid run. The deck picked it up on the next poll and
showed the unwrapped tool with its arguments. I held the key for 650ms, the
approval posted, and the agent resumed and executed against a live Postgres
database with a verified rollback already on file. Production got restored from
that rollback afterwards, which was the point of having it.

That is the entire loop working with nothing stubbed, and it took embarrassingly
long to get there compared to how short that paragraph is.

## What Qodo found that I did not

The worst one: hold to arm was checking tool names against a destructive list,
so the harness `exec` tool sailed straight through on a plain Enter press.
`exec` runs whatever you hand it. It was, by a wide margin, the most dangerous
thing in the queue and the check I had written to catch dangerous things did
not see it, because I had built a name matcher and told myself it was a risk
model. Fixed by classifying on capability rather than on a list of strings I
happened to think of at the time.

Second, Enter auto repeat. Hold the key a beat too long on a write tool and the
browser fires the keydown again, and the deck posted duplicate approvals for
the same gate. Every approve path now ignores repeat events.

Third, an animation with a fill mode that quietly killed the hover lift on
cards. Nothing errored. The animation just left the transform pinned at its end
state and the interaction I had spent time tuning was gone, and I had been
looking at it for a day without noticing.

Fourth, a glow effect that painted outside its box and produced horizontal
scrolling at 390px. Fine at every width I had actually tested.

[IMAGE: docs/blog-assets/mobile-390.png - 390px after the fix. The payload block wraps instead of pushing the page sideways, and the two buttons stay side by side rather than stacking.]

## The visual side

Dark ops console, borrowing conventions from Raycast: one alarm accent used
only for the destructive path, a radius ladder rather than one rounding value
sprayed everywhere, keycap chrome on the shortcut hints so the keyboard map is
legible without a legend.

[IMAGE: docs/blog-assets/session-rail.png - The session rail is deliberately the quietest column on the screen. One session is waiting and carries the only accent in the list. The other seven report their token counts and last tool and otherwise stay out of the way.]

There are explicit anti slop rules written down in the repo for this, and the
short version is that a tool you stare at during the tense part of a run should
be quiet, and quiet is harder than it sounds when every default in every
component library wants to be friendly.

The thing I did not expect going in is how much of this was reading the
harness event stream carefully rather than designing screens. Approving an
agent action is a decision, and a decision needs the facts arranged so you can
see them in a second and a half. Most of the work was arranging.

Repo: https://github.com/aarav1656/approvedeck
