# Design: Postgres-backed session persistence for `lib/nuxt-iam-client` (WP-4, part 1)

## Context

`lib/nuxt-iam-client`'s `createIamSession`/`getIamSession`/`setIamSessionMetadata`/
`destroyIamSession` (`src/runtime/server/utils/auth.ts`) currently persist sessions via
`useStorage(sessionStorageNamespace(instanceId))` — Nitro's storage layer, defaulting to an
in-memory driver. Every restart/deploy of a consuming app (`home`, `simple-ai-os`) forces every
signed-in user to re-authenticate, and the store can't be shared across more than one instance.
This is `docs/backlog.md`'s WP-4 item, part 1 of 3 (retention policy and backup/restore are
separate, deliberately deferred items).

Initial framing considered swapping the `unstorage` driver for a Postgres-backed one
(`unstorage`'s `db0` driver). Reconsidered: `unstorage` is already only in the picture because
the library happens to call `useStorage()` internally — nothing about session storage actually
needs a generic KV abstraction. This spec instead gives the library its own first-class,
Drizzle-managed Postgres table, removing `unstorage`/`useStorage` from session handling
entirely.

This is a shared-library change: `lib/nuxt-iam-client` is consumed by both `home` (two mounts:
`admin`, `tenant`) and `simple-ai-os` (one mount: `tenant`).

## Decisions

1. **New table, owned by the library itself**: `iam_client_sessions` —

   | Column | Type | Notes |
   |---|---|---|
   | `id` | `text` primary key | the random session token itself (unchanged from today — same value used as the cookie) |
   | `instance_id` | `text` not null | which mount this session belongs to (`'admin'`, `'tenant'`, etc.) — replaces today's per-mount `useStorage` namespace isolation; indexed |
   | `username` | `text` not null | |
   | `email` | `text` not null | |
   | `access_token` | `text` not null | |
   | `refresh_token` | `text` not null | |
   | `access_token_expires_at` | `bigint` (drizzle `{ mode: 'number' }`) not null | epoch-millis number, **not** `timestamptz` — matches the existing in-memory `Session.accessTokenExpiresAt: number` exactly, so the existing `Date.now() >= session.accessTokenExpiresAt` comparison logic in `getIamSession` needs no changes |
   | `app_id` | `text` not null | |
   | `metadata` | `jsonb` nullable | |
   | `created_at` | `timestamptz` not null default now() | |

2. **The library manages its own Postgres connection, independent of the consuming app's own
   database driver choice** (`home` uses `postgres`/postgres-js, `simple-ai-os` uses `pg`/
   node-postgres — irrelevant here, since this is a fully separate connection). New: `pg` +
   `drizzle-orm` dependencies on the library; a `databaseUrl` module option, falling back to
   `process.env.DATABASE_URL` (matching how every other DB-touching file in this workspace reads
   it) — not threaded through Nuxt `runtimeConfig`, since (per `module.ts`'s own existing
   comment about the `iamClientInstances` nesting pitfall) a value that needs to differ from a
   value baked in at build time is safest read directly from `process.env` at call time, and
   `DATABASE_URL` is already environment-injected the same way in every consuming app. A single
   module-level connection pool is reused across multiple mounts in the same app (no duplicate
   pools for `home`'s `admin`+`tenant` mounts).

3. **Migration runs via a lazy, first-request Nitro plugin the module registers itself**,
   mirroring the exact pattern already proven safe in every consuming app's own
   `server/plugins/migrate.ts` (deferred to first real request, `x-nitro-prerender`-guarded,
   `503` + promise-reset on failure — **never** `process.exit()`, per the documented incident in
   `docs/learnings/learnings.md`). The module pushes its migrations folder into
   `nuxt.options.nitro.serverAssets` and registers the plugin via `@nuxt/kit`'s
   `addServerPlugin`, both guarded so a second `setup()` call (a second mount in the same app,
   e.g. `home`'s `admin`+`tenant`) doesn't register either twice.

4. **Transparent to consuming apps**: `createIamSession`/`getIamSession`/
   `setIamSessionMetadata`/`destroyIamSession` keep their exact existing signatures and behavior
   contracts — only their internals change. `home` and `simple-ai-os` need **zero code changes**;
   both already have `DATABASE_URL` set. `sessionStorageNamespace()` and all `useStorage` calls
   for sessions are deleted from the library.

5. **`attemptCookieName`/`setAuthAttempt`/`getAuthAttempt`/`clearAuthAttempt` are unaffected** —
   those are short-lived (10-minute) CSRF-style state/nonce pairs stored directly in a cookie
   already, never in `useStorage`, so there's nothing to migrate there.

## Testing

- `lib/nuxt-iam-client`: unit tests for the rewritten `createIamSession`/`getIamSession`/
  `setIamSessionMetadata`/`destroyIamSession` against a real local Postgres (mirroring how
  `simple-ai-os`'s own e2e-api tests already work against real Postgres) — round-trip a session,
  confirm `instance_id` isolation (two mounts' sessions with different `instanceId` never
  collide), confirm expiry comparison still works with the epoch-millis-number column.
- Manual smoke test: run `home` and `simple-ai-os` each against a real local `iam`, confirm login
  still works end-to-end with no app-side code changes, and confirm a session survives a dev
  server restart (the actual behavior being fixed).

## Out of scope

- Retention policy for `prompt_history`/`threads` (WP-4 part 2, separate future spec).
- Per-tenant-schema backup/restore strategy (WP-4 part 3, separate future spec).
- A reaper for abandoned sessions (a user who never explicitly logs out or hits a refresh
  failure leaves a row behind indefinitely) — this becomes part of WP-4 part 2's retention-policy
  scope, not solved here.
- Any change to the auth *flow* itself (state/nonce validation, token exchange, refresh
  rotation) — only where session data is persisted changes.
