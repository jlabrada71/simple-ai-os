# Backlog

Future work identified but deliberately postponed. For each item: description, value, and the
consequence of leaving it unimplemented. See
`docs/architecture/07-target-architecture.md` for the full target design these items are drawn
from, and `docs/superpowers/specs/2026-08-19-multitenancy-sso-design.md` for the phase-1
multitenancy + SSO spec they follow on from.

## WP-4 — Retention and backup (part 1, persistent session store, is done)

**Persistent `iam` session store: done (2026-08-20).** `lib/nuxt-iam-client` now persists
sessions to its own Postgres table (`iam_client_sessions`) instead of in-memory `useStorage`,
with zero code changes needed in `home` or `simple-ai-os` — see
`docs/superpowers/specs/2026-08-20-iam-client-persistent-sessions-design.md`.

**Remaining**: define retention policy for `prompt_history`/`threads` (a per-tenant-schema
backup/restore strategy is the other still-open part of the original WP-4 scope).

**Value**: bounded storage growth for `prompt_history`/`threads`, and a documented per-tenant
backup/restore strategy.

**Consequence of not doing it**: `prompt_history`/`threads` grow unbounded with no defined
cleanup; no documented recovery path if a tenant's schema is lost.

~~## iam token verification (RS256/JWKS + introspection)~~ **Moved to `docs/future-work.md`
(2026-08-21)** — investigation found the original framing overstated the risk (the login
exchange isn't actually vulnerable the way it looked), and the real motivation/mechanism
choice needs its own scoped brainstorming when a concrete need for third-party token
verification actually materializes. See `docs/future-work.md` for the full writeup.

## Tenant-admin promotion UI

**Done (2026-08-21).** `home` forwards the tenant owner's email through provisioning;
`simple-ai-os` seeds them as the tenant's first admin via a one-shot `pending_admin_email`
marker in `tenant_config`, claimed on their first SSO login. Admins manage roles from the new
`/team` page (`GET`/`PATCH /api/team`), which blocks demoting the last remaining admin. See
`docs/superpowers/specs/2026-08-20-tenant-admin-promotion-ui-design.md` and
`docs/architecture/ADR/0007-tenant-admin-bootstrap-via-pending-email-marker.md`.

**Remaining gap** (unchanged, accepted): a tenant provisioned without an owner email (CLI
script, backfill script) still has zero admins until one is promoted manually via SQL.

