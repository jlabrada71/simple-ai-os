# Backlog

Future work identified but deliberately postponed. For each item: description, value, and the
consequence of leaving it unimplemented. See
`docs/architecture/07-target-architecture.md` for the full target design these items are drawn
from, and `docs/superpowers/specs/2026-08-19-multitenancy-sso-design.md` for the phase-1
multitenancy + SSO spec they follow on from.

## WP-4 — Retention, backup, and persistent session store

**Description**: define retention policy for `prompt_history`/`threads`, a per-tenant-schema
backup/restore strategy, and move `nuxt-iam-client`'s `iam:sessions` storage off its
in-memory default onto Redis or a DB-backed driver.

**Value**: production-safe session persistence (survives restarts, works with >1 instance)
and bounded storage growth.

**Consequence of not doing it**: `iam` sessions are lost on every restart/deploy (forcing
re-login) and can't scale past a single instance; `prompt_history`/threads grow unbounded
with no defined cleanup.

## WP-5 — Tenant-scoped, bearer-authenticated MCP

**Description**: require `Authorization: Bearer <token>` on `/mcp` requests, and scope prompt
exposure to the resolved tenant, closing the current stateless-and-unauthenticated MCP surface.
The per-user API keys added for the threads/messages REST API (`server/lib/apiKeys.ts`,
`server/utils/requireTenantSession.ts`'s bearer-token path) are a natural fit for this — `/mcp`
could accept the same `sao_...` tokens rather than inventing a separate credential, sidestepping
the `iam` HS256/no-JWKS blocker entirely (see the next item).

**Value**: MCP clients can only read prompts belonging to the tenant they're authorized for,
instead of any tenant's data being reachable by anyone who can reach `/mcp`.

**Consequence of not doing it**: `/mcp` remains unauthenticated and un-scoped even after the
rest of the app is tenant-isolated and SSO'd — the biggest structural gap left after phase 1.
**No longer blocked** on `iam` exposing RS256/JWKS + introspection (see the next item) — the
per-user API key mechanism doesn't touch `iam` tokens at all, so WP-5 can ship independently of
that.

## iam token verification (RS256/JWKS + introspection)

**Description**: `iam` Phase 1 signs with HS256 (shared secret, no JWKS) and exposes no
introspection endpoint; `nuxt-iam-client` decodes the `id_token` without verifying its
signature. Track when `iam` adds RS256/JWKS + introspection so `simple-ai-os` can verify
signatures instead of trusting a decoded-but-unverified token.

**Value**: closes a security gap in the `iam` SSO login path itself (the `id_token` exchanged
during login) — independent of WP-5 now that WP-5 doesn't need it.

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

## API key management UI

**Description**: `POST/GET/DELETE /api/api-keys` exist but have no frontend — a user who wants a
personal API key has to call the endpoints directly (e.g. via curl) after logging in through the
browser once to get a session cookie.

**Value**: a settings page would let users self-serve key creation/rotation/revocation without
needing to know the raw endpoints.

**Consequence of not doing it**: API keys stay a power-user/integration feature reachable only by
someone comfortable calling the REST API directly.
