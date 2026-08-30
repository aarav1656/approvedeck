=== APPROVEDECK SUBMISSION (aarav1656) ===

BLOG LINK:
https://github.com/aarav1656/approvedeck/blob/main/docs/DESIGN-NOTES.md
(if not present yet, use README: https://github.com/aarav1656/approvedeck)

DEPLOYED LINK:
(leave blank - it connects to your own local TrueForge server)

YOUTUBE VIDEO:
<paste after upload; file demo/approvedeck-demo.mp4, mirror https://files.catbox.moe/od6dtw.mp4>

WHAT DOES YOUR PROJECT DO?
Agent harnesses stop and wait for a human before anything irreversible. That pause
is the whole safety story, and today it is buried in a chat transcript. Run five
agents and the approval that matters is three tabs deep and forty messages up, so
people either miss it or rubber-stamp it later without reading. ApproveDeck is a
dedicated operator surface for that pause: one screen showing every pending
approval across every TrueForge session, as cards carrying the agent, the real MCP
tool name (unwrapped from the harness call_tool envelope), the exact JSON payload,
and how long the agent has been blocked. Destructive tools, detected on both the
tool name and the payload arguments, get a red rail and require a 650 ms
hold-to-arm rather than a single click; denials carry a structured reason. It is
keyboard-first: j and k move, Enter approves, d denies with reason chips, Esc
clears. A decision log records every approve and deny with the response latency, so
a team can see how fast they actually unblock their agents. It is for anyone
running more agents than they have browser tabs.

HOW DID YOU USE TRUEFORGE?
ApproveDeck is a client for the TrueForge harness, built entirely on its REST API
and event model. It polls GET /api/v1/sessions, walks each session's latest turn,
and reads state.required_actions to find pending tool.approval_required and
ask-user gates. To show what the agent actually wants to run it reassembles
streamed tool-call arguments from the turn event stream, where the id arrives on
the first delta and the arguments arrive as later chunks, then unwraps the MCP
call_tool envelope so the card names the real tool (execute_approved_operation
(saferun-db)) instead of the harness wrapper. Decisions post back a
user.tool_approval turn input with allow or deny plus a reason, which resumes the
paused agent immediately. Everything on screen is live harness state: in our end to
end run a database agent paused at an approval gate, the deck surfaced it, we held
to arm, and the agent resumed and executed against a real Postgres database with a
verified rollback on file.

HOW DID YOU USE QODO?
Every change went through a pull request reviewed by Qodo before merging. It caught
things a diff-only reviewer would not: our localStorage decision log had a
same-tab staleness bug (the hook only listened for cross-tab storage events), a
read-modify-write race, and unbounded growth with silently swallowed quota errors.
On the UI PR it found that our entrance animation used animation-fill-mode: both,
which retained the final transform and silently killed the hover lift we had just
advertised, and that the ambient glow behind the pending section extended past the
viewport and created horizontal scrolling at 390 px. On the interaction PR it found
six real bugs including the harness exec tool bypassing hold-to-arm protection
because our destructive regex only matched the tool name, and Enter key auto-repeat
firing duplicate approvals. All fixed with follow-up reviews.

MOST USEFUL TRUEFORGE FEATURE:
The approval gate itself, exposed as data. Because tool.approval_required lands in
turn state as a structured required_action with a tool_call_id, and because
user.tool_approval is just another turn input, the entire product is possible
without any harness modification or plugin API. The harness treats human decisions
as first-class events, so a third-party UI can participate in the loop as a peer of
the built-in chat. Second place: the unwrappable call_tool envelope, which let us
show operators the real tool identity rather than a generic wrapper.

WHERE DID YOU GET STUCK / DX IMPROVEMENTS:
Reconstructing a pending approval was harder than it should be. required_actions
gives you a tool_call_id and nothing else, so to render a useful card we had to
fetch the turn's events and reassemble streamed argument fragments, remembering
that only the first delta carries the id. A resolved {name, arguments} summary on
the required action would delete a whole module of client code. We also hit
ambiguity in ordering: sessions come newest first but turn lists needed different
handling, which cost us a bug where the deck showed a stale turn. Finally,
deny reasons are supported in the schema but not documented with an example, so we
had to read the discriminator to learn the shape. A short "building a custom
approval client" page with these three things would be enough.

QODO RATING: 5

MOST USEFUL / FRUSTRATING PART OF QODO:
Most useful: it reviews behaviour, not formatting. Being told that our own hover
animation was dead because of a fill-mode interaction, or that a keyboard shortcut
we documented in the README never opened the UI it claimed to open, is the kind of
feedback that usually only arrives from a user after launch. It also connected our
README claims to the code and flagged where they disagreed. Frustrating: on a
one-day build the two to three minute review round trip interrupts flow, and one
finding (tests do not exist) was an artifact of the test suite living in a parallel
PR rather than a real defect. What we would change: a fast incremental mode for
follow-up pushes and awareness of stacked or sibling PRs.

WHICH PR STOOD OUT:
https://github.com/aarav1656/approvedeck/pull/4 (keyboard queue, hold-to-arm, deny
chips, focus mode). Qodo found six interaction bugs, and two of them undermined the
product's core safety claim: the harness exec tool (arbitrary shell) was not
classified as destructive, so it could be approved with a single click instead of
the hold gate, and Enter auto-repeat could fire duplicate approvals because there
was no in-flight guard. A UI reviewer looking at the diff sees a nice keyboard
feature. Qodo saw that the safety mechanism had a hole exactly where it mattered.
