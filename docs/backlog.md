# Backlog

Future work identified but deliberately postponed. For each item: description, value, and the
consequence of leaving it unimplemented. See
`docs/architecture/07-target-architecture.md` for the full target design these items are drawn
from, and `docs/superpowers/specs/2026-08-19-multitenancy-sso-design.md` for the phase-1
multitenancy + SSO spec they follow on from.

## WP-3 — DB-backed conversation storage (threads/messages)

**Description**: replace the `unstorage` fs `session` namespace (`{ messages,
claudeResponse }` blobs keyed by `session_id`) with tenant-schema `threads`/`messages`
tables tied to `tenant.users`.

**Value**: conversation history becomes queryable, tenant-scoped by construction (not just
by cookie host-scoping), survives across devices/sessions for the same user, and closes the
"split-brain" between the fs session store and the DB-backed tenant model.

**Consequence of not doing it**: chat history stays tied to a single browser's cookie rather
than the authenticated user; it can't be listed, searched, or migrated; and it's the one part
of the app that isn't actually inside the tenant's Postgres schema despite everything else
being schema-isolated.

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

**Description**: require `Authorization: Bearer <iam access token>` (or a derived
`simple-ai-os`-issued token) on `/mcp` requests, and scope prompt exposure to the resolved
tenant, closing the current stateless-and-unauthenticated MCP surface.

**Value**: MCP clients can only read prompts belonging to the tenant they're authorized for,
instead of any tenant's data being reachable by anyone who can reach `/mcp`.

**Consequence of not doing it**: `/mcp` remains unauthenticated and un-scoped even after the
rest of the app is tenant-isolated and SSO'd — the biggest structural gap left after phase 1.
Blocked on `iam` exposing RS256/JWKS + introspection (see next item) for anything relying on
JWT signature verification rather than decode-only trust.

## iam token verification (RS256/JWKS + introspection)

**Description**: `iam` Phase 1 signs with HS256 (shared secret, no JWKS) and exposes no
introspection endpoint; `nuxt-iam-client` decodes the `id_token` without verifying its
signature. Track when `iam` adds RS256/JWKS + introspection so `simple-ai-os` can verify
signatures instead of trusting a decoded-but-unverified token.

**Value**: closes a security gap before any bearer-authenticated surface (notably WP-5's MCP)
trusts a JWT's claims.

**Consequence of not doing it**: WP-5 either stays blocked or ships trusting unverified token
claims, which is not acceptable for a bearer-authenticated API surface.

## Tenant-admin promotion UI

**Description**: phase 1 creates a `tenant.users` row with `role: 'member'` for whoever
completes SSO login first; promoting a member to `role: 'admin'` is a manual direct-DB
update. Add an admin UI/endpoint for this (mirroring `home`'s admin patterns).

**Value**: tenant owners can manage their own team's roles without operator involvement.

**Consequence of not doing it**: every role change requires a manual DB update from whoever
has direct Postgres access, which doesn't scale past a handful of tenants and blocks tenants
from self-managing membership.
