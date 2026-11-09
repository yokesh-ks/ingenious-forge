Ingenious Clan is one local-first workspace where people and AI agents work as a team across code, money, markets and knowledge. Its look comes from the guild hallmark: a piece of silver carried a maker's mark, an assay mark and a date, so anyone could see who made it, that it was tested and when. Every screen here does the same for agent work.

## The idea in four rules

1. **Colour is evidence.** The interface is neutral iron and ink. Use `proof` only when something was proven, `gate` only when a person must decide, and `halt` only when something failed or stopped. If a colour is not reporting a fact, remove it.
2. **Nothing is proven by saying so.** Show `Hallmark` or `EvidenceBlock` beside every accepted result. A result with no evidence shows the `unproved` state, never a blank.
3. **Every action has a name on it.** Show `ActorMark` wherever something happened. Humans are round and agents are square, and that shape is reserved.
4. **The person holds the authority.** Money movement and trading always stop at `ApprovalGate` with step-up, whichever agent or surface asked. `KillSwitch` is never disabled and never asks for confirmation.

## Content fundamentals

Write like a good ledger: who did what, to what, with what result.

- Address the person as "you". Name agents by role: Reviewer, Bookkeeper, Scout, Builder, Archivist. Agents never say "I" in interface copy.
- Use sentence case everywhere except `punch` cells, which are capitals.
- No emoji, no exclamation marks, no "magic", "smart" or "seamless".
- Lead with the verb and give the count. Say what did not work as plainly as what did.
- Use the same verbs everywhere:

| Verb | Means | State |
| --- | --- | --- |
| Proposed | An agent wants to do this | `queued` |
| Ran | Execution finished, result not yet checked | `running` |
| Proved | A check confirmed it | `proved` |
| Held | Waiting for you | `held` |
| Approved | You allowed it | `proved` |
| Refused | You or a policy said no | `refused` |
| Failed | A check disagreed | `failed` |
| Halted | Stopped by the kill switch | `halted` |

Say this:

> Bookkeeper reconciled 412 of 415 entries. 3 did not match.

> Scout proposed a paper order. It is over Scout's limit, so it waits for you.

> Reviewer proved the change. 212 tests passed in 14.2 s.

Not this:

> All done! Your books look great.

> AI is working its magic on your trades.

Use "Trading is halted", not "Paused". Use "Paper" on every paper-trading surface, so simulated and live money can never be confused.

## Visual foundations

**Name.** Write Ingenious Clan as two words, both capitalised, and name each module a trade: Ingenious Forge, then Finance, Trading, Wiki, Slides and Schedules.

**Logo.** The mark is a C for Clan built from the system's reserved shapes: seven square agents around one round brass person. It stays open on one side, because the person directs the agents and is never shut in by them. This is the one place `gate` appears without a decision pending. Use `Logo` in the product and the Logos asset files everywhere else. Keep one tile of clear space around the mark, and do not set it below 16px. Use `clan-mark` on light grounds and `clan-mark-reversed` on dark ones. Keep the single-colour files for places with no colour, such as engraving. Never recolour the disc, square it, add tiles, close the gap or rotate the mark.

**Colour.** Build pages on `ground`, with panels in `surface` and popovers in `surface-raised`. Set text in `ink`, and secondary text in `ink-muted`. Primary buttons are `ink` with `on-ink`, not a brand colour, because the brand colours are spoken for. Reach for a `-wash` token to tint a whole row or panel. Use `up` and `down` in Trading, always with a triangle, and never reuse `proof` or `halt` for a price move: a rising price is not a proven fact. The trade rail stays `iron` in both themes.

Every status carries a word or icon as well as colour. `proof` sits on the blue side of green and `halt` on orange, so the pair stays apart under colour-blindness.

**Type.** Three families, three jobs.

- `font-display` is the sign over the door. Use `sign-*` sparingly, at most one per panel.
- `font-sans` is the conversation. `body` is the default.
- `font-mono` is the record. Anything that could be audited, such as figures, hashes, timestamps, command output and limits, is set in `record`, `record-sm`, `figure` or `punch`.

Self-host the three families in the desktop and extension builds, since the daemon must work offline and the fonts are all open licensed.

**Layout.** Spacing runs on a 4px base, `space-1` to `space-7`. The rail is `rail-width`, each trade has a `TradeSidebar` at `sidebar-width` beside it, screens have no app header, panels sit on `space-5` gaps, and rows are dense: `space-2` vertical padding. Web, desktop and extension share one layout. In the extension's narrow panel, the rail collapses to its active trade.

**Edges.** Corners are nearly square: `radius-sm` for marks and tags, `radius-md` for controls and panels, `radius-lg` for dialogs only. `radius-full` is for people. Separate things with `line`. Controls take `line-strong`. `shadow-raised` is for overlays only.

Totals in a `LedgerTable` take a double rule, as in accounting.

**Motion.** Keep it short and meaningful: 120ms for hover and focus, 200ms for panels. A `Hallmark` may land once with a 160ms stamp, scaling from 1.06 to 1, when it is first earned. Spinners are for `running` only. Drop all of this under `prefers-reduced-motion`.

**States.** Hover moves a surface one step, for example `surface` to `surface-sunken`. Every focusable element shows `focus` as a 2px ring offset by 2px. Disabled controls lower opacity and say why nearby. `KillSwitch` has no disabled state.

**Imagery.** There is none in the product. The figures, marks and records are the picture.

## Iconography

Use Lucide at 16px with a 2px stroke, in the text colour of its context. Components in this system inline the few glyphs they need. Pair an icon with a word for every status. Use no emoji or decorative glyphs. Each item on the `TradeRail` has one Lucide icon, drawn at 20px above its name. For now the rail shows only Work, with the briefcase icon, and Settings, with the settings icon. Icons are reserved for items added later: landmark for Finance, candlestick-chart for Trading, book-open for Wiki, presentation for Slides, calendar-clock for Schedules, plug for Plugins, globe for Sites and layers for Artifacts. An icon identifies its destination, so it takes no colour of its own.

## Ingenious Forge

Ingenious Forge is the first trade built on this system, and the rail labels it Work. Its screen has four columns: `TradeRail`, `TradeSidebar` at `sidebar-width` holding `ProjectTree`, the conversation, and the workspace panel at `panel-width`, which starts collapsed. There is no app header. The sidebar is titled with the rail label in `sign-md`, and its foot holds `DaemonStatus` and the theme toggle. The first row of each column is `header-height`, so their rules line up.

- **Completed is not proved.** `TurnStatus` and `TaskList` report what the agent says it finished, so they stay neutral. `proof` appears only on a `Hallmark` or an `EvidenceBlock` backed by a check that ran.
- **Held work is brass everywhere.** `ToolApproval` and `AgentQuestion` appear in the conversation, the session shows `held` in `SessionHeader` and `ProjectTree`, and `TradeRail` carries the count.
- **Show the exact thing.** An approval shows the literal command or diff. Buttons read Approve, Deny and Always allow. A denial is recorded in the `refused` state with the word Denied.
- **Diffs have their own colours.** Use `added` and `added-wash`, `removed` and `removed-wash`, always with a + or − sign. Do not use `proof` or `halt` for them.
- **Code stays in ink.** Highlight syntax with `ink`, `ink-muted` and weight only, so colour in a code view still means a change.
- **Sandbox trouble is loud, and a working sandbox is silent.** Show `SandboxNotice` only when commands are not confined.
- **Git is reported, not operated.** `BranchStatus` shows state, and people ask the agent to branch, commit or push.
- Name the working agent Builder (`BLD`) and the reviewing agent Reviewer (`RVW`).
- Theme Forge's Shadcn components through the Shadcn theme section, not with palette classes.

## Fail-safe behaviour the design must keep

- A gate never times out into approval. On timeout it shows `refused`.
- If the daemon is unreachable, `DaemonStatus` shows offline and every action that needs policy stops. Do not show cached results as current.
- The audit chain is shown as intact or broken, never hidden. A broken chain uses `halt`.
