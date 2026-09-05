# Hunterstellar 2.0 - UX redesign

Date: 2026-09-04
Status: approved design, ready for implementation plan
Scope: `frontend/` only. No backend changes.

## The problem

The visual language is settled and stays. The information architecture is the defect.

On the Journey screen, when a team is standing at a station, `pages/Dashboard.jsx`
stacks these blocks above the clue:

1. Back chevron + title (Layout header)
2. "Chapter N of 5" eyebrow
3. Chapter name heading
4. `ProgressBar`
5. `StaleChip` (conditional)
6. `LockoutBanner` (conditional)
7. Rate-limit warning box (conditional)
8. "A teammate moved the team forward" box (conditional)
9. `Toast` (conditional)
10. `state.notice` banner (conditional)
11. `state.announcement` banner (conditional)

Three always render. Seven are conditional and nothing prevents all seven from
appearing at once. The clue itself is block 11 or later, the input is below it,
and a four-item nav rail sits under that. The frame is 412px wide.

This is the mega-dashboard failure: everything at Tier 1. Per
`20 Areas/Design Engineering/Craft-Interaction/Progressive disclosure has four canonical mechanisms, pick by weight of the reveal.md`,
the split between shown and deferred is what decides whether disclosure works,
and a crowded Tier 1 fails the whole screen regardless of how good the parts are.

Four specific faults:

**Redundant encoding.** "Chapter 3 of 5" sits directly above a progress bar
carrying the same fact. `Craft-Motion/Motion should carry state, not repeat it.md`
names the general rule: one channel per change, and running several channels for
one event forces the user to parse noise.

**Five status boxes for one status slot.** Notice, announcement, stale,
rate-limit, and teammate-moved are five independent full-width boxes at the same
altitude, each defensible alone.

**Lockout is a banner when it is the entire state.** A locked team can do nothing
for fifteen minutes, but that renders as a strip plus an apologetic paragraph in
an otherwise empty body. Per
`Craft-Interaction/Empty, loading, skeleton, error - four states are the minimum a screen owes.md`,
these are screens, not null branches.

**Logout is a nav tab.** A rare, session-ending action sits at Tier 1 as a peer of
three navigation destinations, one thumb-width away from them.

## Non-goals

- No changes to color, type, or texture tokens. The visual language is approved.
  The one exception is the failing error red, below, which is a correctness fix.
- No backend changes, which rules out new endpoints and schema edits alike.
- Not writing the fragment copy. `FRAGMENT_LINES` and `ASSEMBLED_MESSAGE` in
  `utils/story.js` stay `TODO`. Build and test against realistic-length dummy
  strings so layout is proven, and leave the placeholders for the event owners.
- Not fixing the backend `/health` false-positive or the load-test timeouts.
  Both are real, both are logged separately, neither belongs in a frontend pass.
- No compulsory story or prologue gate. The previous story machine was removed
  deliberately (see the `LEGACY_FLOW_KEY` comment in `context/AuthContext.jsx`)
  and is not coming back as a required step.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Shell structure | One task, one screen. Journey renders only the current clue or question plus its input. Everything else moves to sheets. | Cheapest disclosure cost that makes Tier 1 scannable. Keeps the familiar bottom tab bar, so the convention users arrive with still holds. |
| Progress bar | Delete `components/ui/ProgressBar.jsx` | Redundant second channel for a fact the eyebrow already states. Stop position moves to a compact indicator plus the journey map sheet. |
| Fragments | Card deck with in-place expand | Detail belongs to exactly one card, each is short prose, and teams open several to compare. That is the definition of expand over peek or drill. |
| Story / prologue | Opt-in archive inside the Fragments screen. Never blocks play. | Reuses `STORY.baseBriefing` and the per-station `arrival` / `reveal` / `gained` copy, which is written and currently imported by nothing. |
| Logout | Out of the nav rail, into a sheet from the Journey header | Rare and session-ending. Prominence should match frequency and reversibility. |
| Anime.js | Upgrade 3.2.2 to 4.x | `svg.createDrawable`, `createScope`, and `stagger` are v4-only. Alternative was CSS `stroke-dashoffset`, which draws a line but cannot choreograph the staggered reveal. |
| Motion scope | Anime.js at exactly three sites. CSS everywhere else. | Frequency tiering, per the Atlassian rule recorded in `10 Projects/armoriq-platform-proto/vs-industry/28-motion-and-feedback.md`. |

## Disclosure model

### Tier 1, zero clicks: the current task and nothing else

- Station name and stop numeral, one compact line
- The clue, or the question. Dominant element, display scale.
- First clue image only, boxed at `aspect-[4/3]` to match the existing skeleton
  so the swap from placeholder to loaded art does not shift layout
- Input plus exactly one primary button
- One status slot, collapsed to a single line unless something is live

Test applied: *would a team be annoyed to tap for this every single time?* Only
these pass.

### Tier 2, one predictable gesture: bottom sheet with detents

- Journey map: which stop, which are done, station names already revealed
- All clue images, full screen
- Status detail, expanded from the single Tier 1 line
- Fragment card body, expanded in place
- Session actions including logout

`Craft-Interaction/Modal, drawer, popover, sheet - pick by the shape of the interruption.md`:
on mobile, prefer a sheet with detents over a centered dialog, because it
respects touch physics.

### Tier 3, intentional navigation

- Leaderboard, own tab
- Fragments, own tab
- Story archive, inside Fragments
- Finished, its own route

## Screens

Nine screens. Wireframes are indicative, not pixel specs.

### 1. Journey / clue (`/dashboard`, `stage: awaiting_code`)

```
+------------------------------------+
| CARINA . III              v map    |   tap = journey map sheet
+------------------------------------+
|                                    |
|  CLUE 3                            |   display-grunge, accent
|                                    |
|  The relay where the pulse was      |   17px, generous leading
|  first modelled. Find the room      |
|  that never faces its star.         |
|                                    |
|  +------------------------------+  |
|  |      [ clue image ]          |  |   tap = fullscreen sheet
|  +------------------------------+  |
|  + 2 more images                   |   only if images.length > 1
|                                    |
|  +------------------------------+  |
|  | Enter station code           |  |
|  +------------------------------+  |
|  +------------------------------+  |
|  |      DECRYPT SIGNAL          |  |   one primary action
|  +------------------------------+  |
|                                    |
|  ! 1 notice                   v    |   ONE status slot
+------------------------------------+
|  (o) Fragments  (*) Journey  (T) LB|   three tabs, no logout
+------------------------------------+
```

The header is the only new affordance and it is labeled (`map`), not a naked
chevron. Mystery-meat disclosure is the failure mode being avoided.

### 2. Journey / question (`stage: awaiting_puzzle`)

Same shell. `CLUE 3` becomes `CHALLENGE 3`. No images. Keeps the existing
"Wrong answers don't lock you" line, which is load-bearing copy: teams conflate
the wrong-code penalty with the wrong-answer non-penalty and stop guessing.

### 3. Lockout (full screen, replaces the banner)

```
+------------------------------------+
| CARINA . III                       |
+------------------------------------+
|                                    |
|                                    |
|         [ SVG lock glyph ]         |   static, no loop
|                                    |
|            14:32                   |   mono, tabular-nums, huge
|                                    |
|         SIGNAL JAMMED              |
|                                    |
|  A wrong code costs fifteen        |
|  minutes. Your fragments are       |
|  still readable.                   |
|                                    |
|  +------------------------------+  |
|  |      READ FRAGMENTS          |  |   the one useful action
|  +------------------------------+  |
|                                    |
|  Find a marshal if this is wrong.  |
+------------------------------------+
|  (o) Fragments  (*) Journey  (T) LB|
+------------------------------------+
```

Names what happened, why, and what to do next: the three things an error state
owes. Offers the one action that is still possible, so this is not a
drill-to-nothing.

### 4. Fragment reveal (full screen, interstitial)

Fires once per solved stop, four times per hunt. The only place with full
expressive motion. Detail in the motion section.

### 5. Fragments (`/planet`) - card deck plus story archive

```
+------------------------------------+
| Fragments                          |
+------------------------------------+
|  DATA FRAGMENTS                    |
|  2 of 4 recovered                  |
|                                    |
|  +------------------------------+  |
|  | FRAGMENT I                ^  |  |   earned: card-noise, expanded
|  | The pulse needs a bearing... |  |
|  +------------------------------+  |
|  +------------------------------+  |
|  | FRAGMENT II               v  |  |   earned: collapsed
|  +------------------------------+  |
|  +- - - - - - - - - - - - - - -+  |
|  | FRAGMENT III           (lock)|  |   locked: dashed, redacted bars
|  +- - - - - - - - - - - - - - -+  |
|  +- - - - - - - - - - - - - - -+  |
|  | FRAGMENT IV            (lock)|  |
|  +- - - - - - - - - - - - - - -+  |
|                                    |
|  TRANSMISSION LOG                  |
|  +------------------------------+  |
|  | The briefing              v  |  |   opt-in story, expand
|  +------------------------------+  |
|  +------------------------------+  |
|  | Carina                    v  |  |   only stations reached
|  +------------------------------+  |
+------------------------------------+
```

When all four are earned, a fifth visually distinct card carries
`ASSEMBLED_MESSAGE` in `void-gold`.

The transmission log is the answer to "story should be revisitable but never
compulsory". It lists only stations the team has actually reached, so it cannot
spoil what is ahead, and it is pure reading with zero actions, which is why it
expands rather than drilling.

### 6. Leaderboard (`/leaderboard`)

Rank 1 becomes the solid accent noise slab from `docs/design/leaderboard-comp.png`.
Ranks 2 and 3 alternate outlined and inverted, per the same comp. The team's own
row is marked wherever it lands. Sort and tie-break logic is unchanged.

### 7. Finished (`/finished`)

Full screen. Terminal state, so no input and no nav-driven escape hatch beyond
Fragments.

### 8. Login (`/login`)

Structurally fine. Changes: hard edges to match the comp, error copy switched to
the corrected red, a sub-120ms press state on submit, and the existing
`.shake` on a rejected password. No skeleton, because there is nothing to load.

### 9. NotFound

Unchanged apart from token and edge alignment.

## Component plan

### Delete

| File | Reason |
|---|---|
| `components/ui/ProgressBar.jsx` | Redundant channel. Its only consumer of `PLANET_LIST` goes with it. |
| `lib/anime.js` (v3 helpers) | Dead code today, nothing imports it. `progressFill` animates the deleted bar. Replaced by the v4 module. |

### New

| File | Purpose | Mechanism |
|---|---|---|
| `components/ui/Sheet.jsx` | Bottom sheet with detents, focus trap, ESC and backdrop close, matched-axis exit | detach |
| `components/StatusSlot.jsx` | Collapses notice, announcement, stale, rate-limit, teammate-moved into one line that expands | expand |
| `components/StopIndicator.jsx` | Compact station name plus stop numeral | Tier 1 |
| `components/JourneyMapSheet.jsx` | Five stops, done / current / unknown | detach |
| `components/ImageSheet.jsx` | Full-screen clue images, swipe between | detach |
| `components/FragmentDeck.jsx` | The four cards plus the assembled card | container |
| `components/FragmentCardExpandable.jsx` | One card, expands in place | expand |
| `components/TransmissionLog.jsx` | Opt-in story archive from `STORY` | expand |
| `components/reveal/FragmentReveal.jsx` | Anime.js SVG glyph draw plus staggered text | interstitial |
| `components/SessionSheet.jsx` | Team identity, logout | detach |
| `pages/Lockout.jsx` | Full-screen locked state | screen |
| `lib/motion.js` | JS motion tokens mirroring the CSS custom properties | tokens |

### Modify

| File | Change |
|---|---|
| `components/Layout.jsx` | Nav 4 items to 3. Logout out of the rail. Header gets the labeled disclosure control. |
| `pages/Dashboard.jsx` | Strip to one task. Route to `Lockout` and `FragmentReveal` as screens rather than inline branches. State logic in `useTeamState` is unchanged. |
| `components/ClueCard.jsx` | Display-scale numeral, hard edges, one image inline, rest disclosed |
| `components/PuzzleCard.jsx` | Same treatment, no images |
| `pages/Planet.jsx` | Becomes deck plus transmission log |
| `pages/Leaderboard.jsx` | Rank-1 slab, own-row marker |
| `pages/Finished.jsx`, `pages/Login.jsx`, `pages/NotFound.jsx` | Edges, error red, press states |
| `src/App.css` | Motion tokens, corrected red, hard-edge utilities |

Nothing in `hooks/useTeamState.js`, `api/client.js`, or `context/AuthContext.jsx`
changes. The data layer is sound and the reasoning behind it is well documented.
This pass is presentation only.

## Motion system

### Tokens

Three durations, three curves. Defined once in `App.css`, mirrored in
`lib/motion.js` so Anime.js reads the same shelf. Named by job, not by number.

```
--duration-instant:    120ms   feedback only: press, focus, checkbox
--duration-base:       220ms   standard: sheet, expand, toast, status slot
--duration-expressive: 640ms   once-a-session only: fragment reveal

--ease-enter:    cubic-bezier(0.2, 0, 0, 1)      arrival, decelerates
--ease-exit:     cubic-bezier(0.4, 0, 1, 1)      departure, accelerates
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)    both ends
```

Three bands, from
`Craft-Motion/Perceived performance rides three thresholds - 100ms, 300ms, 1000ms.md`:
under 100ms is acknowledgment and cannot narrate; 150 to 300ms is where product
tempo is set; past 300ms a wait needs a skeleton or an interrupt.

### Rules

- One channel per state change. Not shake plus color plus icon plus sound.
- Reverse retraces the forward axis. A sheet that rises from the bottom exits
  downward, never sideways.
- Only enter, exit, and reorder genuinely require motion. Hover, focus, and
  active states are communicated with color and weight.
- Stagger 40 to 60ms per item, total sequence under 500ms, windowed past twenty
  items. Not relevant at current list sizes but the fragment reveal uses it.
- Any motion over 300ms is interruptible. The fragment reveal is skippable by
  tap on its first frame.

### Where Anime.js earns its place

Exactly three sites. Everything else is CSS.

**1. Fragment reveal.** Seen four times per hunt. An SVG fragment glyph draws
itself with `svg.createDrawable`, then the label and line stagger in at 50ms.
Total under `--duration-expressive`. This is the emotional peak of the hunt and
the one place expression is paid for by rarity.

**2. Code accepted.** Seen five times. A seal or unlock glyph draws, capped at
300ms, then the next clue enters. Carries the state change from "this station is
done" to "here is the next one", which is exactly the enter case where motion is
not optional.

**3. App boot / route transition.** A route line draws while the first
`/team/state` is in flight. Used only here because the shape is genuinely unknown
at that moment. Everywhere else the shape is known, so it is a skeleton.

### Where Anime.js is deliberately not used

| Moment | Frequency | Treatment | Reason |
|---|---|---|---|
| Submit press | dozens | CSS, 120ms | Under the 100ms window the eye has not landed. Animation cannot narrate, only acknowledge. |
| Wrong answer | dozens | CSS `.shake`, already defined | Single channel. Adding color plus icon plus scale makes it louder, not clearer. |
| Clue loading | every poll | Skeleton | Shape is known. Spinner is for unknown shape. Never both. |
| Sheet open / close | frequent | CSS transform, 220ms | Standard band. A library adds nothing a transform cannot do. |
| Status slot expand | frequent | CSS grid-template-rows, 220ms | Same. |

### Reduced motion

Not the primary spec minus animation. A designed alternative: fades preserved,
durations shortened, translates and draws replaced with opacity. The Anime.js
sites check `prefers-reduced-motion` and render the end state directly. The
existing `@media (prefers-reduced-motion: reduce)` block in `App.css` covers the
CSS keyframes already and gets extended, not replaced.

## State matrix

Enumerated before building, per engineering rule 1. `-` means not reachable.

| Screen | empty | loading | skeleton | error | offline | stale | rate-limited | blocked (403) | success |
|---|---|---|---|---|---|---|---|---|---|
| Login | - | button spinner | - | inline, corrected red, `.shake` | banner, submit disabled | - | countdown, submit disabled | - | navigate to Journey |
| Journey / clue | `stage: ready` standby copy | route-draw SVG on first load only | clue skeleton on poll | keep last good clue, stale chip in status slot | banner, input disabled | status slot, tap to retry | status slot countdown, input disabled | event not started or ended screen | seal draw, next clue enters |
| Journey / question | - | as above | question skeleton | as above | as above | as above | as above | as above | fragment reveal |
| Lockout | - | countdown from server `lock_until` | - | if `lock_until` missing, show indefinite plus marshal prompt | countdown continues, local clock | - | - | - | auto-return to clue on expiry |
| Fragment reveal | - | - | - | if `fragment_index` out of 1 to 4, skip screen entirely | renders, no network needed | - | - | - | continue to next clue |
| Fragments | zero earned: teaching copy plus one action | - | four locked cards as the natural skeleton | derived from cached `progress`, cannot fail alone | full function, no network needed | - | - | - | - |
| Leaderboard | no teams yet: honest zero, not "No data" | - | row skeleton | "Could not load", retry | banner, last known rows | last-updated chip | - | - | - |
| Finished | - | - | - | - | full function | - | - | - | terminal |
| NotFound | - | - | - | - | - | - | - | - | - |

Rows to call out:

- **Fragments works entirely offline.** Derived from `user.progress` in context,
  no fetch. Correct on a freshly cleared phone, which matters because four
  teammates share one login and only one of them sees any given reveal.
- **Blocked (403) is not a logout.** `api/client.js` already gets this right and
  must not regress: only 401 ends a session. A 403 from the event gate is a
  normal game state.
- **Honest zero on the leaderboard.** "No teams yet" is a real state distinct
  from a failed query. Never collapse them.

## Accessibility

Fixes, verified rather than assumed. Ratios computed against `--color-bg`
`#262626` and `--color-surface-alt` `#2B2B2B`.

**Failing, must fix.** `--color-red: #EF4444` gives **4.02:1** on `bg` and
**3.76:1** on `surface-alt`. Every error message uses it at 14px, which is
normal text, so it needs 4.5:1. Change to `#F87171`: **5.47:1** on `bg`,
**6.16:1** on `surface`. This is the one token change in an otherwise
visual-language-frozen pass, and it is a correctness fix rather than a taste
change.

**Passing, no change.** `text-primary` 14.00:1, `text-secondary` 10.72:1,
`accent` 7.06:1, `amber` 7.05:1, `teal` 8.13:1, `void-gold` 11.08:1,
`green` 5.97:1, `rust` 6.42:1, `text-muted` 5.51:1, `indigo` 5.07:1.

**Type floor.** Several labels are `text-[10px]` and `text-[11px]` with
`tracking-[0.3em]`. Contrast is not the issue, legibility is: a team reads this
in a corridor, in a hurry, possibly one-handed. Raise incidental labels to 12px
minimum and keep the wide tracking, which is what carries the brand.

**Hit targets.** Audited: nav items are 64x48px, above the 44px floor. No change
needed. New sheet close buttons and card expand triggers must clear 44px.

**Sheet semantics.** `role="dialog"`, `aria-modal="true"`, focus trap, ESC to
close, focus restored to the trigger on close. Backdrop click closes. This is
the one genuinely new interaction primitive, so it carries the most a11y risk.

**Countdowns.** `aria-live="polite"`, never `assertive`. A ticking assertive
region interrupts a screen reader every second.

**Reduced motion.** Covered above. Live inside it for a session before shipping
the primary motion.

## Risks and open questions

| Risk | Mitigation |
|---|---|
| Hiding a clue image behind a gesture could cost a team the station | Keep the first image inline at a constrained aspect, disclose only the rest. Never hide all imagery. |
| Anime.js v4 upgrade could break the build | Nothing imports v3 today, so the upgrade has zero call sites to migrate. Delete the wrapper and write fresh against v4. |
| Sheet primitive is the largest new surface and the biggest a11y risk | Build it first, in isolation, before any screen depends on it. |
| Fragment reveal is a full-screen interstitial mid-hunt | Skippable on the first frame. `pendingReveal` already persists in `localStorage`, so an accidental dismiss is not a lost fragment. |
| Lockout as a full screen could feel punitive | It offers the one action still available (read fragments) and a marshal prompt. Naming the state honestly beats burying it in a strip. |

Open question for the event owners, not blocking: the four fragment lines and the
assembled message. Layout is built and proven against realistic-length dummy
text, so dropping the real copy into `utils/story.js` is the only remaining step.

## Build sequence

Each step independently shippable, later steps consume primitives from earlier ones.

1. Motion tokens in `App.css` plus `lib/motion.js`. Corrected error red. Type floor.
2. `Sheet` primitive, in isolation, with full a11y. Nothing depends on it yet.
3. `StatusSlot`. Collapses five boxes into one. Largest single density win.
4. `StopIndicator` plus `JourneyMapSheet`. Delete `ProgressBar`.
5. Strip `Dashboard` to one task. `ClueCard` and `PuzzleCard` retreatment. `ImageSheet`.
6. `Lockout` as a screen. Remove `LockoutBanner` from the Journey stack.
7. Anime.js v4 upgrade. Delete the v3 wrapper. `FragmentReveal`.
8. `FragmentDeck` plus `FragmentCardExpandable`. `Planet` rebuild.
9. `TransmissionLog`. Wires up the already-written dead `STORY` copy.
10. `Layout` nav to three items. `SessionSheet` for logout.
11. `Leaderboard` rank-1 slab and own-row marker.
12. Walk the state matrix row by row in a browser. Report each row as built or
    deliberately skipped, per engineering rule 1.

## Sources

Vault notes this design is grounded in, all under `C:\Users\ashut\Vault`:

- `20 Areas/Design Engineering/Craft-Interaction/Progressive disclosure has four canonical mechanisms, pick by weight of the reveal.md`
- `20 Areas/Design Engineering/Craft-Interaction/Empty, loading, skeleton, error - four states are the minimum a screen owes.md`
- `20 Areas/Design Engineering/Craft-Interaction/Modal, drawer, popover, sheet - pick by the shape of the interruption.md`
- `20 Areas/Design Engineering/Craft-Motion/Motion should carry state, not repeat it.md`
- `20 Areas/Design Engineering/Craft-Motion/Perceived performance rides three thresholds - 100ms, 300ms, 1000ms.md`
- `20 Areas/Design Engineering/Craft-Motion/Motion tokens are a language, not a decoration.md`
- `20 Areas/Design Engineering/Craft-Motion/Stagger is choreography; timing turns a list into a phrase.md`
- `20 Areas/Design Engineering/Craft-Motion/prefers-reduced-motion is a design decision, not a media query.md`
- `10 Projects/armoriq-platform-proto/vs-industry/28-motion-and-feedback.md` (Atlassian frequency tiering)
- `10 Projects/armoriq-platform-proto/vs-industry/23-empty-states-and-honest-zero.md`

Design references in this repo:

- `docs/design/login-comp.png`, `clue-comp.png`, `leaderboard-comp.png`
- `docs/design/wireframes/` (22 `.dc.html` artboards covering offline, rate-limited, skeleton, and four complication states)
