# ADR-0002: Prompt version comparison UI

## Status

Accepted (2026-07-16)

## Context

ADR-0001 added a `prompt_history` table and a `GET /api/prompts/:id/history` endpoint so a
prompt's past versions are retrievable, but there was no way to actually look at how a
prompt had changed — the data existed with no UI to read it. We needed a way, from the Edit
Prompt page, to pick an old version and see what's different about it compared to what's
being edited right now.

This required three decisions: what diffing approach/library to use, what the diff should
be computed against (the persisted current version, or whatever's currently typed in the
form), and which fields to diff.

## Decision

**Library**: Added `@donedeal0/superdiff` (zero runtime dependencies) as a dependency.
`getTextDiff()` produces a word-level diff for `content` and `description`; `getListDiff()`
produces an added/removed diff for `variables`. Installed inside the running dev container
so the lockfile stayed consistent with its npm version, per this project's existing
convention (see the earlier `package-lock.json` regeneration commit).

**Diff baseline**: The diff compares a selected historical version against whatever is
*currently typed in the live form* — not the last-saved version. This makes the panel
useful immediately after clicking "Improve" or making unsaved edits, to see exactly what
changed relative to an older version before deciding whether to save.

**Diff scope**: Only `content`, `description`, and `variables` are diffed. `name` and `tags`
are excluded — they're metadata about the prompt, not the prompt's actual instructional
text, and weren't part of what this feature was asked to cover.

**UI shape**: A "Compare with a previous version" toggle on the Edit Prompt page reveals a
second, read-only panel beside the edit form (two-column grid on wide viewports, single
column otherwise) with a version dropdown sourced from the history endpoint. Selecting a
version shows its field values plus the diff. This is strictly a read-only comparison view:
there is no "restore this version" action.

**History loading**: The version dropdown's options load as soon as the toggle is switched
on (a `watch` on the toggle), not lazily on first interaction with the dropdown (e.g. on
`focus`). The initial implementation used `@focus`, which turned out to be unreliable —
Playwright's `selectOption()` doesn't reliably trigger a native focus event, and relying on
focus at all delays the fetch until the user already has the dropdown open, which reads as
a stall rather than an load-in-progress state.

## Alternatives considered

- **Diff against the persisted current version instead of the live form**: rejected —
  would make the panel useless for its most common use case (checking what an
  in-progress/unsaved edit, or an Improve-button rewrite, changed relative to history)
  until the user saves first.
- **Diff all fields (including `name` and `tags`)**: rejected as unnecessary scope for this
  pass; `content`/`description`/`variables` are what actually reflect a prompt's behavior
  changing over time.
- **A hand-rolled diff algorithm** instead of a library: rejected — text and list diffing
  with move/add/remove detection is a solved problem with real edge cases (word boundaries,
  punctuation, reordering); reimplementing it isn't worth it for a tutorial app when a
  small, dependency-free, well-tested library is available.
- **Restoring a historical version directly from the compare panel**: rejected for this
  change — not requested, and conflating "compare" with "restore" would need its own
  confirmation/undo considerations. Left as a natural future extension.

## Consequences

- New runtime dependency: `@donedeal0/superdiff`. It has zero dependencies of its own, so
  the addition is low-risk, but it's still one more package to keep updated.
- The compare panel re-fetches nothing per version selection — all history entries are
  fetched once (on toggle-on) and diffs are computed client-side per selection via computed
  properties, so switching between versions is instant with no extra network calls.
- Diffing against live (possibly unsaved) form content means the diff can change every time
  the user types — this is intentional per the decision above, but means the diff is not a
  stable "what will be saved vs. version N" comparison unless the user has already saved.
