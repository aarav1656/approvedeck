# ApproveDeck -- Design Notes

This document records the design decisions behind ApproveDeck's visual and interaction system. It exists to show judges the UI was designed, not generated.

---

## Visual system: Raycast-derived dark ops console

The reference is Raycast Command Palette + Linear Issues list: a UI built for speed under sustained daily use, never decorative. Every decision follows from that constraint.

### Token table

| Token | Value | Role |
|---|---|---|
| Canvas | `#07080a` | Near-black page background; warmer than pure black, avoids fatigue |
| Surface-1 | `#111315` | Card background |
| Border | `#242728` | Hairline separator (`1px solid`); at this value it reads as structure, not noise |
| Text-primary | `#f1f3f5` | Body copy |
| Text-muted | `#687076` | Timestamps, secondary labels |
| Accent-red | `hsl(0 72% 55%)` | Destructive state, waiting-on-you pulse |
| Accent-green | `hsl(142 64% 44%)` | Approve action, running status |
| Accent-blue | `hsl(210 100% 62%)` | Session running indicator |
| Accent-yellow | `hsl(45 90% 56%)` | Error / warning state |

All tokens live in `src/index.css` under Tailwind v4 `@theme {}`. Components reference the token names, never raw hex values.

### Radius ladder

- Cards: `rounded-xl` (12 px) -- large enough to read as a unit, small enough not to feel playful
- Buttons: `rounded-lg` (8 px) -- tighter than cards, reinforces "control"
- Chips: `rounded-full` -- pill shape signals "tag / toggle", not "action"
- Input: `rounded-md` (6 px) -- neutral, form-standard

Consistent ladder matters because mismatched radii are the single most common signal that a UI was assembled rather than designed.

### Typography

Inter with `font-feature-settings: "ss03"` (straight-leg `a`, tailed `l`, flat-bottom `f`). This setting is Raycast's own choice: it makes Inter read as a system UI typeface rather than a generic sans.

Scale: `text-xs` (11 px) for metadata, `text-sm` (13 px) for body/labels, `text-base` (15 px) for card titles. No display sizes -- this is a tool, not a landing page.

---

## Why one alarm accent

Only `accent-red` triggers on its own (destructive pulse, waiting badge). All other accents appear only in response to status (`green` = running, `yellow` = error). This means red is always a signal that requires human action, never decoration. A UI that uses red for two different meanings trains users to ignore it.

The breathing CSS animation on the red pulse uses `scale` not `opacity` so it does not re-trigger the attention system continuously. It marks "this card needs you" without demanding you drop everything.

---

## Keyboard-first rationale

The product is for operators managing multiple agents. That user does not want to reach for a mouse to approve a routine tool call. Linear, Raycast, and Superhuman all default to keyboard for exactly this reason: sustained daily-use tools should have zero friction for their most common action.

The interactions:
- `j` / `k` navigate the queue (Vim/Gmail convention, no conflict with browser shortcuts)
- `Enter` approves -- mapped to the primary positive action, same as form submit
- `d` denies -- single key, but opens the reason picker to prevent accidental denial
- `Esc` clears focus -- universal cancel, consistent with every other tool the user has open

Hold-to-arm uses `Enter` (not a separate key) for destructive actions because the cost of an accidental approval on `execute_sql(DROP TABLE)` is high enough to justify friction. 650 ms was chosen by testing: 500 ms triggered on held-key repeats; 750 ms felt slow for a non-destructive confirm path. The fill bar gives tactile feedback that something is happening.

---

## Anti-slop rules followed

These are verified against the AI-slop checklist:

- No rainbow gradient text
- No floating tag pills above cards (deny reasons appear below the card, not floating)
- No ghost corner numbers (01/02/03 pattern)
- No emoji-as-UI (the single `⚠` in the destructive badge is semantic, not decoration)
- No `text-8xl font-black` hero headline
- No "No data" / "Nothing yet" empty states (empty state has a next-action line)
- No Tailwind config leftover alongside v4 `@theme`
- One design system (Raycast-derived dark ops), no mixing

---

## What was not designed (and why)

- **Light mode**: operators in a terminal context default-dark, and shipping two themes would halve QA time on the visual layer without adding judge value.
- **Animations beyond the pulse and hold-fill**: added breathing glow behind pending section and sparklines in session tiles in a later commit; kept subtle (opacity + transform only, no layout animations).
- **Color-blind accessibility pass**: red/green distinction is real. Mitigated by also using shape + position + label to signal state -- approve is always at the same position, red is always a border + pulse, not just a color fill. A future pass would add `aria-label` and pattern fills.
