# ADR-0001: Prompt version history via a denormalized, unlinked `prompt_history` table

## Status

Accepted (2026-07-16)

## Context

The `prompts` table stores only the current state of a prompt plus a `version` counter
that increments on every update. Prior content is overwritten in place, so there was no
way to see how a prompt's content had changed over time, compare versions, or tell that a
prompt had ever existed once it was deleted.

We needed a way to:

- Record every past version of a prompt as it's edited, so changes (and improvement) over
  time can be reviewed.
- Retain a prompt's version trail even after the prompt itself is deleted, specifically so
  it's possible to tell that a prompt *used to exist* and see its last known state.

## Decision

Add a `prompt_history` table (`server/db/schema.ts`, `docker/init.sql`) that stores a full,
denormalized snapshot of a prompt's fields (`name`, `content`, `description`, `tags`,
`variables`, `version`, `score`) at a point in time, plus:

- `action`: `'updated' | 'deleted'` — why the snapshot was taken.
- `promptCreatedAt` / `promptUpdatedAt`: the original prompt row's own timestamps, so
  provenance is preserved.
- `archivedAt`: when the snapshot itself was written.

Snapshots are taken by application code, not database triggers:

- `updatePrompt` reads the current row, inserts it into `prompt_history` with
  `action: 'updated'`, then applies the update — all inside one transaction. History ends
  up holding versions `1..N-1`; the live `prompts` row holds the current version `N`.
- `deletePrompt` deletes the row from `prompts`, inserts the deleted row into
  `prompt_history` with `action: 'deleted'`, and returns it — also inside one transaction.
  This makes the final, `'deleted'`-flagged entry the last item in that prompt's history.

`prompt_history.prompt_id` deliberately has **no foreign key** back to `prompts.id`. A hard
FK (even with `ON DELETE CASCADE`) would either block deleting a prompt while its own
history snapshot exists in the same transaction, or delete that history along with it —
both defeat the purpose of this table. `prompt_id` is a plain, indexed UUID column instead;
referential integrity with the live table is intentionally not enforced.

A new endpoint, `GET /api/prompts/:id/history`, queries `prompt_history` directly by
`prompt_id` and does not check whether the prompt still exists in `prompts` — so it keeps
working for prompts that have been deleted.

## Alternatives considered

- **FK with `ON DELETE CASCADE`**: rejected — would delete a prompt's history along with
  the prompt itself, which is the opposite of what we needed (surviving deletion).
- **FK with `ON DELETE SET NULL`**: rejected — would sever `prompt_id`, the exact key used
  to correlate a prompt's history rows across time, making "show me this prompt's history"
  no longer possible for deleted prompts without some other identifier.
- **Soft-delete `prompts` instead (e.g. a `deleted_at` column) and skip a separate history
  table for the delete case**: rejected — doesn't solve the update-history requirement on
  its own, and conflates "current record, soft-deleted" with "historical record," which
  would complicate every existing query against `prompts` (list, get, unique-name checks)
  with `deleted_at IS NULL` filtering.
- **A generic audit-log table for all tables (JSON diff blobs, single `audit_log` table)**:
  rejected as overkill for a single-table, single-use-case need in a small tutorial app;
  a dedicated, typed `prompt_history` table is simpler to query and reason about.

## Consequences

- Every `updatePrompt` and `deletePrompt` call now does two writes instead of one (a select
  in the update case, plus an insert, plus the update/delete itself), all in a transaction.
  Acceptable overhead for a CRUD table with no expected high-frequency write load.
- `prompt_history` grows without bound — there is no retention/cleanup policy. Fine for a
  tutorial project; a real deployment would want one eventually.
- Because there's no FK, the database itself won't stop `prompt_history` rows from
  referencing a `prompt_id` that never existed (e.g. a typo'd id in a future manual
  insert). This is an accepted tradeoff for the "survive deletion" requirement.
- No UI has been built yet to view a prompt's history or diff versions — this ADR and the
  underlying table/endpoint only cover the data model and read API.
