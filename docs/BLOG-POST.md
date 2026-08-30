# Why I built a separate screen just for approving agent actions

The approval gate is the most important moment in an agent run and it usually
shows up as a line of text somewhere in a chat log, sandwiched between the
model narrating its plan and the model narrating its plan again. You are meant
to read a JSON payload rendered inline, decide whether it is safe, and click
something. I kept catching myself skimming.

So ApproveDeck is one screen and only one screen. Every pending gate across
every session, with the agent that raised it, the MCP tool name unwrapped out
of its envelope, the exact JSON arguments, and how long that gate has been
sitting there waiting for a human. Nothing else competes for the space.

## The keyboard is the interface

j and k move down and up the queue, Enter approves, d opens the deny reason
chips, Esc clears whatever state you are in. That is the whole map, and after
about twenty minutes of using it I stopped looking at the screen when moving
between items.

Destructive tools do not get Enter. They get a 650ms hold to arm: press and
keep pressing, watch the ring fill, and if you let go early nothing is posted.
No modal, no typing DELETE into a box to prove you meant it. I picked 650ms by
holding a few different durations and noticing where my thumb stopped being
able to do it accidentally. 400 felt like a normal click. A full second felt
like being punished.

The reason this matters is that a confirm dialog trains you to dismiss it. A
hold does not, because there is no muscle memory for holding a key down that
you can execute while thinking about something else.

## Getting the gates out of the harness

There is no approvals endpoint, which surprised me for about an hour and then
stopped mattering. The deck polls `GET /api/v1/sessions`, reads
`state.required_actions` on each one, and assembles the picture from that.

The interesting part is the tool call arguments. They arrive streamed, and the
call id shows up on the first delta while the arguments come through as later
chunks, so a naive read gives you a tool call with an id and an empty argument
object. I lost a chunk of an afternoon to gates that rendered with `{}` as the
payload before I understood the shape of it. The fix is to reassemble across
deltas keyed on that id, then unwrap the `call_tool` envelope to get at the
real tool underneath, because the outer name is always `call_tool` and tells
you nothing about whether you are about to approve a read or a drop.

Resolving a gate is a `user.tool_approval` turn posted back to the session.
Once that lands, the agent picks up mid turn and keeps going.

Two more surfaces sit on top of the same event data. The chain of custody
timeline is a per session spine built from real harness events with durations
attached, so you can see where the run actually spent its time rather than
where you assume it did. The decision log counts approvals and denials and
tracks response latency, which is the number I expect to get worse over a long
session and wanted visible rather than guessed at.

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

## The visual side

Dark ops console, borrowing conventions from Raycast: one alarm accent used
only for the destructive path, a radius ladder rather than one rounding value
sprayed everywhere, keycap chrome on the shortcut hints so the keyboard map is
legible without a legend. There are explicit anti slop rules written down in
the repo for this, and the short version is that a tool you stare at during the
tense part of a run should be quiet, and quiet is harder than it sounds when
every default in every component library wants to be friendly.

The thing I did not expect going in is how much of this was reading the
harness event stream carefully rather than designing screens. Approving an
agent action is a decision, and a decision needs the facts arranged so you can
see them in a second and a half. Most of the work was arranging.

Repo: https://github.com/aarav1656/approvedeck
