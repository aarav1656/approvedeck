# ApproveDeck — Hostile Judge Verdict (Best UI / iPad)

Judged on branch `feat/focus-mode` @ `c273360`, live at `http://localhost:5199`.
Judge profile: dev-tool builder, Raycast/Linear taste, actively looking for a
reason to say no. State judged is what the app renders *right now*, not the
README's aspirational screenshots.

> NOTE: the worktree mutated twice mid-review (live agents editing). The empty
> state gained a **Decision Log stats panel** while I was reading it. That panel
> is the single biggest thing standing between this and "feels empty," so it is
> judged as present. Good call by whoever shipped it. It is also placed with a
> broken indent and lives in the wrong column (see #2).

---

## Scores (/10)

| Axis | Score | One-line |
|---|---|---|
| Visual polish | 8.0 | Genuinely Raycast-grade tokens, restraint, hairlines. A few unfinished corners. |
| Interaction design | 8.5 | Hold-to-arm, j/k queue, deny chips, focus dim. Best-in-show mechanics, invisible at rest. |
| Information design | 7.0 | Clear hierarchy; wasted right rail; destructive heuristic is a lie by regex. |
| Completeness-feeling | 6.5 | Decision Log rescues it. Empty-of-agents first load still reads "is this wired up?" |
| Demo evidence | 7.5 | Real e2e run, real screenshots, demo video + narration. Cards feel staged, not in-app. |
| **Weighted overall** | **7.4** | A serious, tasteful tool that under-sells itself on the exact screen a judge sees first. |

**Verdict: STRONG CONTENDER, NOT YET THE WINNER.** With the "all clear + 0
sessions" cold-open, a judge who never triggers a live gate sees a near-empty
page and a stats box reading `1 / 0 / 117.6s`. The craft is real but it is
*hidden behind an event that may not happen during judging*. Fix the cold-open
and this takes the iPad.

---

## What I saw first (the thing that matters)

Landing state, no live agents: header (`ApproveDeck · mission control · all
clear`), a big **"Nothing waiting on you"** shield card, **"AGENT SESSIONS 0 →
No active sessions"**, and a **Decision Log** showing `1 approved / 0 denied /
117.6s median` with one `execute_approved_operation · 118s wait` row.

Honest reaction: *"Clean. Tasteful. But is it actually connected to anything, or
am I looking at a styled placeholder?"* Three of the four panels are empty
states. The one populated panel shows a median response time of **117.6
seconds**, which advertises a slow operator, not a fast one. That is the first
number a judge reads and it works against you.

The `117.6s median` is a data artifact (one real decision that sat 118s during
dev), but the judge does not know that. **It looks like the product's headline
metric is "we take two minutes to approve."**

---

## Why I would NOT award the iPad — ranked, each with a <1h fix

### 1. The cold-open reads "empty / not wired up." (completeness) — TOP BLOCKER
Three empty panels + one stats box is what a judge sees if no gate fires during
judging. Nothing on screen *demonstrates the core loop* (a card → approve →
resume) without a live agent cooperating on cue. You are betting the demo on an
external event.
**Fix (<1h):** Add a **Demo / Replay toggle** in the header that injects 2–3
canned `PendingApproval` cards (one destructive `execute`, one `delete`, one
`ask_user_question`) into `approvals` state, purely client-side, labeled
`demo`. Judge clicks it, sees the full deck light up, hold-to-arm, deny chips,
focus mode — all without TrueForge running. This is the single highest-ROI
change and it converts "is this real?" into "oh, *that's* what it does."

### 2. Decision Log is misplaced and mis-indented. (information design + polish)
It renders at line 860 *inside* the `<aside>` sessions rail, after the sessions
list, with visibly broken indentation (`          <DecisionPanel />` dangling
under a `</div>`). In the 300px right column the 3-stat grid is cramped and the
`117.6s` / `MEDIAN RESPONSE` label wraps awkwardly. It reads like it was
stapled on (because it was).
**Fix (<1h):** Move `<DecisionPanel />` out of `<aside>` into its own full-width
row *below* the grid, or promote the three stats (approved / denied / median)
into a slim **header stat strip** next to the status pill so they are visible
above the fold on every load. Fix the indent.

### 3. "Median response 117.6s" is an own-goal number. (information design)
Your one populated metric actively markets slowness. A dev-tool judge notices.
**Fix (<15m):** Either (a) seed the demo/replay decisions with realistic sub-5s
latencies so the median reads `2.3s`, or (b) relabel to **"last response"** and
format `<60s` as seconds but cap the headline, or (c) hide median until N≥3
decisions and show "approve rate" instead. Do not ship `117.6s` as the hero
stat.

### 4. Destructive detection is a regex on the tool *name*, not intent. (correctness a judge will probe)
`DESTRUCTIVE_RE = /execute|exec|delete|drop|truncate|write/i` tested against
`a.toolName`. A judge asks "what about `run_sql` that contains `DROP TABLE` in
its args?" → no red pulse, no hold-to-arm, one-click approve on a table drop.
The safety theater has a hole and it is the exact thing the product claims to
guard.
**Fix (<1h):** Also scan `a.toolArgs` for `\b(drop|delete|truncate|alter)\b` and
raise the destructive flag on either name OR payload match. One-line change to
the `destructive` computation, closes the credibility gap.

### 5. Focus mode / hold-to-arm are invisible until an event fires. (demo risk)
The best interactions (650ms hold with fill bar, focus dim to 0.24, keyboard
hold via Enter) only exist when a destructive card is present and selected. At
rest the judge sees none of your differentiators.
**Fix (<1h):** Covered by #1 (demo cards). Also add a **one-line "how it works"
affordance** — the keyboard hint bar (`j/k · ↵ · d · esc`) only renders when
`allCards.length > 0`; render a muted version always so the keyboard-first story
is legible on an empty deck.

### 6. Right rail is dead weight at rest. (information density)
`AGENT SESSIONS 0 → No active sessions` is a 300px column doing nothing on cold
load. Linear/Raycast never waste a rail.
**Fix (<1h):** When sessions are empty, collapse the rail and let the approval
column + decision log go full width, OR fill the rail with the decision log
(#2) so the space always carries signal.

### 7. Empty-state copy is generic reassurance, not a next action. (polish)
"Agents keep working autonomously. When one hits an approval gate it appears
here instantly." — pretty, but gives the judge nothing to *do*.
**Fix (<20m):** Add a subtle secondary line with the actual command
(`npx @truefoundry/trueforge` + "or press **Demo** to preview a gate") so the
empty state is a launchpad, not a dead end.

### 8. Mobile is clean but untested-looking; no viewport meta proof. (completeness)
390px has no horizontal overflow (verified: scrollWidth == innerWidth == 390),
grid collapses correctly. But the deny-chip input row and the 3-stat grid get
tight. Fine, not wow.
**Fix (<30m):** On `<sm`, stack the deny chips 2-per-row and make the stat grid
`grid-cols-3` → keep but bump gap; verify the `Hold to Approve` fill bar still
tracks touch. Low priority.

### 9. README's "Qodo Code Review Evidence" section is an empty stub. (evidence)
`<!-- filled after review cycle -->` under a heading. A judge reading the README
hits a hole in your own credibility section.
**Fix (<20m):** Paste 2–3 real Qodo PR links / the 6-bug fix list already in the
git log (`46bcd60 fix: 6 Qodo review bugs`). You *did the work*; show it.

---

## What genuinely impressed (so this doesn't read as a hit piece)

- **Token discipline.** `#07080a` canvas, hairline `#242728`, accents reserved
  for meaning (red=waiting, green=approve, blue=running, yellow=error). Inter
  ss03. This is real Raycast/Linear literacy, not a Tailwind default dump.
- **Hold-to-arm is the right instinct.** 650ms hold with a snap-back fill bar,
  keyboard parity (Enter down/up), touch-cancel handling, window-blur cancel.
  Extracted into a pure, unit-tested controller (10 tests). This is
  senior-grade interaction engineering.
- **Keyboard-first queue.** j/k navigate, ↵ approve, d deny, esc clear, with
  auto-select, in-flight guard against Enter auto-repeat, and scroll-into-view.
  This is how a Linear power user expects an inbox to behave.
- **Deny-with-reason chips** (`wrong env / too broad / needs human / policy`)
  plus free text, required for destructive. Thoughtful, real operator ergonomics.
- **Focus mode** dimming everything to 0.24 and centering the destructive card
  is a genuinely classy touch under pressure.
- **Anti-slop: clean.** No rainbow gradients, no emoji-as-UI (the single `⚠` in
  the destructive badge is defensible), no ghost corner numbers, no floating tag
  pills. The breathing orb behind the pending section is tasteful and subtle.
- **Build integrity:** `tsc -b` clean, 29/29 vitest green, no console errors on
  load, no hydration issues. It actually works.
- **Real e2e evidence:** 23 payments deleted against live Postgres with verified
  rollback, screenshots from that run, demo video + narration. Not mocked.

---

## The single addition that makes it feel like a complete product

**A header "Demo" / "Replay" toggle that injects a live-looking deck of 2–3
approval cards client-side.** It simultaneously fixes the top blocker (#1),
surfaces every hidden interaction (#5), gives the sessions rail something to show
(#6), and lets a judge experience the entire approve/deny/hold loop in 10
seconds without TrueForge running or an agent cooperating on cue. Pair it with
moving the Decision Log stats into an always-visible header strip (#2) and
seeding sane latencies (#3), and the cold-open goes from "is this wired up?" to
"this is a finished operator console." That is the iPad.

**Time to fix the top 3 blockers: ~2 hours. Current ceiling if fixed: 8.8/10 and
a legitimate favorite for Best UI.**
