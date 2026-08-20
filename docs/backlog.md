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

## iam token verification (RS256/JWKS + introspection)

**Description**: `iam` Phase 1 signs with HS256 (shared secret, no JWKS) and exposes no
introspection endpoint; `nuxt-iam-client` decodes the `id_token` without verifying its
signature. Track when `iam` adds RS256/JWKS + introspection so `simple-ai-os` can verify
signatures instead of trusting a decoded-but-unverified token.

**Value**: closes a security gap in the `iam` SSO login path itself (the `id_token` exchanged
during login).

**Consequence of not doing it**: `simple-ai-os` continues trusting a decoded-but-unverified
`id_token` during login, same as it does today.

## Tenant-admin promotion UI

**Description**: phase 1 creates a `tenant.users` row with `role: 'member'` for whoever
completes SSO login first; promoting a member to `role: 'admin'` is a manual direct-DB
update. Add an admin UI/endpoint for this (mirroring `home`'s admin patterns).

**Value**: tenant owners can manage their own team's roles without operator involvement.

**Consequence of not doing it**: every role change requires a manual DB update from whoever
has direct Postgres access, which doesn't scale past a handful of tenants and blocks tenants
from self-managing membership.

