# Changes

Summary of work done, most recent first.

## 2026-08-21 (bounded tenant connection pool)

- **Capped `getTenantDb`'s per-tenant connection pool cache at 20 entries with LRU eviction**
  (`server/db/client.ts`), and reduced each pool's own `max` connections from the driver
  default (10) to 3. Previously unbounded, mirroring the same bug found and fixed in `home`.
  See `docs/superpowers/specs/2026-08-21-bounded-tenant-connection-pool-design.md`.

## 2026-08-21 (tenant-admin promotion UI)

- **Tenant-admin promotion UI**: `tenant.users.role` is now load-bearing. `home` forwards the
  tenant owner's email through cross-app provisioning; `simple-ai-os` seeds them as the
  tenant's first admin on their first SSO login via a one-shot `pending_admin_email` marker
  in `tenant_config` (no schema change). Admins manage the team from a new `/team` page
  (`GET`/`PATCH /api/team`, admin-only), which blocks demoting the last remaining admin. See
  `docs/superpowers/specs/2026-08-20-tenant-admin-promotion-ui-design.md` and
  `docs/architecture/ADR/0007-tenant-admin-bootstrap-via-pending-email-marker.md`.

## 2026-08-20 (persistent iam session storage)

- **Postgres-backed `nuxt-iam-client` session storage (WP-4, part 1)**: `lib/nuxt-iam-client`
  now persists `iam` sessions to its own `iam_client_sessions` Postgres table instead of
  Nitro's in-memory `useStorage` default — sessions survive restarts/deploys and can be shared
  across multiple instances. Zero code changes needed in `simple-ai-os` or `home`; both just
  need `DATABASE_URL` set (already true). Verified: both apps boot cleanly, the library's own
  migration runs automatically on first request (deduped across `home`'s two mounts), and a
  session created before a dev server restart is still resolvable after. See
  `docs/superpowers/specs/2026-08-20-iam-client-persistent-sessions-design.md`.

## 2026-08-20 (API key management UI)

- **API key management UI**: new `/api-keys` page (linked from the app nav) lets a user
  create, list, and revoke their own personal API keys — the plaintext token is shown once in a
  dismissible banner with a copy button, matching the "shown once" contract of
  `POST /api/api-keys`. No backend change; uses the existing WP-3 endpoints. See
  `docs/superpowers/specs/2026-08-20-api-key-management-ui-design.md`.

## 2026-08-20 (bearer-authenticated MCP)

- **Tenant-scoped, bearer-authenticated MCP (WP-5)**: `POST /mcp` now requires
  `requireTenantSession` (the same guard as every other tenant-scoped endpoint) instead of a bare
  tenant-resolved check — closes the last unauthenticated tenant-data surface. Accepts either a
  personal API key (`Authorization: Bearer sao_...`, from WP-3's per-user keys) or a browser
  session cookie; no new auth mechanism. See
  `docs/superpowers/specs/2026-08-20-mcp-bearer-auth-design.md`.

## 2026-08-20

- **DB-backed conversation threads + per-user API keys (WP-3)**: replaced the `unstorage` fs
  `session` namespace with tenant-schema `threads`/`messages` tables
  (`server/lib/threads.ts`), tied to the authenticated `tenant.users` row instead of a bare
  `session_id` cookie. `chat-streaming.vue` gained a thread list sidebar (multiple, switchable,
  auto-titled from the first message) backed by a new `app/composables/useThreads.ts`;
  `chat.vue` is unaffected visually (its endpoint auto-resolves the caller's latest thread).
  `GET /api/new-thread` and the `session_id` cookie / `nitro.storage.session` fs driver are
  removed.
  - **Per-user API keys**: `server/lib/apiKeys.ts` + `POST/GET/DELETE /api/api-keys` let a user
    mint a personal-access-token-style key (`sao_...`, shown once, stored only as a SHA-256
    hash). `server/utils/requireTenantSession.ts` now accepts `Authorization: Bearer <token>`
    as an alternative to the session cookie on every tenant-scoped endpoint — prompts, agent,
    agent-stream, and the new threads endpoints all gained this for free, since they all go
    through the same guard.
  - **Real bug found and fixed during manual verification**: `drizzle-kit generate` qualifies
    cross-table foreign keys as `"public"."<table>"` even for tables that only exist via the
    `search_path` schema-per-tenant trick, breaking every new tenant's migration once a
    tenant-schema table referenced another one for the first time (`threads`→`users`,
    `messages`→`threads`, `api_keys`→`users`). Documented in
    `docs/learnings/learnings.md` since it will recur for any future cross-table FK.
  - See `docs/superpowers/specs/2026-08-20-db-backed-threads-design.md` and
    `docs/superpowers/plans/2026-08-20-db-backed-threads.md`.

## 2026-08-19

- **Cross-app tenant auto-provisioning (phase 2)**: `simple-ai-os` gains an idempotent
  `server/lib/provisionTenant.ts` (shared by the CLI script and a new
  `POST /api/admin/tenants` endpoint, protected by `requireAdminApiKey` — ported verbatim from
  `iam`'s pattern) so `web/home`'s own tenant provisioning can trigger it automatically instead
  of requiring the separate manual CLI step from phase 1. New `NUXT_ADMIN_API_KEY` env var.
  Recorded as `ADR/0006`. See `docs/superpowers/specs/2026-08-19-cross-app-tenant-provisioning-design.md`
  and `docs/superpowers/plans/2026-08-19-cross-app-tenant-provisioning.md`. (The `home`-side
  half of this change is recorded in `web/home/docs/changes.md`.)

- **Multitenancy + iam SSO (phase 1)**: implemented `docs/architecture/07-target-architecture.md`'s
  WP-1 (tenant scaffolding) and WP-2 (SSO), per
  `docs/superpowers/specs/2026-08-19-multitenancy-sso-design.md` and
  `docs/superpowers/plans/2026-08-19-multitenancy-sso.md`. `ADR/0004` and `ADR/0005` are now
  Accepted.
  - **Schema-per-tenant Postgres**: new `public.tenants` registry
    (`server/db/schema/public.ts`) and per-tenant `tenant_<slug>` schemas holding `prompts`,
    `prompt_history` (moved out of the old shared schema), `users`, and `tenant_config`
    (`server/db/schema/tenant.ts`). Tenant resolution is by `Host` subdomain
    (`server/utils/tenant.ts`, `server/middleware/tenant.ts`), with a cached
    per-schema Drizzle connection pool (`server/db/client.ts`'s `getTenantDb`/`withTenantDb`).
  - **Migrations**: Drizzle Kit configs (`drizzle.config.public.ts`,
    `drizzle.config.tenant.ts`) replace the old `docker/init.sql`; public-schema migrations
    run lazily on first request (`server/plugins/migrate.ts`, matching `home`'s
    "never `process.exit()` from a per-request hook" fix); `server/db/scripts/provision-tenant.ts`
    creates a tenant's schema, runs its migrations, and registers its own `iam` app.
  - **SSO**: `lib/nuxt-iam-client` mounted in `dynamic` mode (one mount, credentials resolved
    per tenant via `server/utils/resolveTenantIam.ts`) — each tenant owns its own `iam`
    `app_id`/`client_secret`, matching what `home` already does in production rather than the
    single-shared-app model the target doc had speculated about. `server/utils/requireTenantSession.ts`
    gates chat/prompts/MCP; the first successful login for a tenant auto-creates its `users`
    row with `role: 'member'` (this app's provisioning script doesn't seed an owner the way
    `home`'s does).
  - **Removed**: the stub `server/lib/session.ts`, `GET /api/login`, and the
    `assets:sessions` stub namespace. `GET /api/new-thread` was re-added (tenant-session-gated)
    since the fs-backed chat history (`unstorage`'s `session` namespace) is still in place —
    replacing it with DB-backed `threads`/`messages` is deferred (see `docs/backlog.md`).
  - **Deferred to `docs/backlog.md`**: WP-3 (DB-backed threads/messages), WP-4
    (retention/backup/persistent iam session store), WP-5 (bearer-authenticated tenant-scoped
    MCP), and the phase-2 `home`→`simple-ai-os` cross-app auto-provisioning trigger.
  - Also fixed a pre-existing bug in `docker-compose.yml`: the `postgres:18-alpine` volume was
    mounted at `/var/lib/postgresql/data`, which that image version refuses to start against
    (see `home`'s learnings doc) — moved to `/var/lib/postgresql`.

## 2026-08-17 (pending, not yet committed)

- **Target architecture for multitenancy + IAM SSO**: added
  `docs/architecture/07-target-architecture.md` describing the target ("to-be") state for
  (1) schema-per-tenant multitenancy (mirroring `web/home`'s public `tenants` registry +
  `tenant_<slug>` schemas, `getTenantDb` pool, `provision-tenant.ts` script) and (2) SSO
  via the shared `lib/nuxt-iam-client` module against `web/iam`, plus a baseline→target
  gap analysis and a five-work-package roadmap. Recorded the two key decisions as
  `docs/architecture/ADR/0004-multitenancy-schema-per-tenant.md` and
  `docs/architecture/ADR/0005-sso-via-nuxt-iam-client.md`.

## 2026-07-31 (pending, not yet committed)

- **Streaming agent client points at a configurable base URL**: `server/lib/agent-streaming.ts`
  now passes `baseURL: process.env['AGENT_BASE_URL']` to its `Anthropic` client, so the
  streaming chat endpoint (`POST /api/agent-stream`) can be redirected to a local,
  Anthropic-API-shaped service (set to `http://localhost:5050` in `.env`) instead of the
  real Anthropic API. Unset, it falls back to the SDK's default (the real API), so this is
  additive. `AGENT_BASE_URL` was added to `.env.example`. The non-streaming client
  (`server/lib/agent.ts`) is unchanged and still always hits the real API. Recorded as
  `docs/ADR/0003-streaming-agent-configurable-base-url.md`.

## 2026-07-16 (pending, not yet committed)

- **Disable Save until the form actually changes**: the Edit Prompt form's Save button is
  now disabled until at least one field (`name`, `content`, `description`, `tags`,
  `variables`) differs from the last-loaded/last-saved values, via a snapshot taken on load
  and compared with a computed. Prevents accidental no-op saves.
- **Vite dependency pre-bundling for `@donedeal0/superdiff`**: added it to
  `nuxt.config.ts`'s `vite.optimizeDeps.include`, alongside the existing MCP SDK entries.
  Without it, Vite discovered the dependency at request time and triggered a full page
  reload mid-request, which was intermittently breaking Playwright specs that navigate to
  the Edit Prompt page (the page a client had already loaded would reload out from under
  it). Same class of issue the existing MCP SDK entries in that list were already there to
  prevent.

## 2026-07-16

- **Prompt version history**: new `prompt_history` table (`server/db/schema.ts`,
  `docker/init.sql`) that snapshots a prompt's full state on every change. `updatePrompt`
  now records the pre-update row (`action: "updated"`) before applying an edit;
  `deletePrompt` records the final row (`action: "deleted"`) before removing it from the
  live table. `prompt_history` deliberately has no foreign key back to `prompts`, so a
  prompt's history — including its last known state — survives the prompt itself being
  deleted. New endpoint: `GET /api/prompts/:id/history`, which works even for prompts that
  no longer exist. Both operations run inside a transaction. Recorded the reasoning as
  `docs/ADR/0001-prompt-version-history.md` (first ADR in the project).
- **Compare prompt versions in the Edit Prompt form**: a "Compare with a previous version"
  toggle reveals a read-only panel next to the edit form with a dropdown of past versions
  (from the history endpoint above). Picking one shows its Content/Description/Variables
  plus a live diff against whatever's currently in the form, using `@donedeal0/superdiff`
  (`getTextDiff` for Content/Description, `getListDiff` for Variables). Two real bugs found
  and fixed along the way: loading history lazily via the dropdown's `@focus` event was
  unreliable, so it now loads as soon as the toggle is switched on; and diff tokens were
  rendering with no spaces between words because Vue's whitespace-condensing was eating a
  literal space in the template, fixed by baking the space into the interpolated string.
  Also hit a real Docker gotcha: `npm install`ing the new dependency inside an already-running
  container updated `package.json`/`package-lock.json` on the host but not the image itself
  (the Dockerfile's `npm ci` only runs at build time, and the live install lived in an
  anonymous volume that didn't survive the container being recreated) — fixed by rebuilding
  with `docker compose up -d --build -V postgres dev`. Recorded the library/baseline/scope
  decisions as `docs/ADR/0002-prompt-version-comparison-ui.md`.
- **Remove Delete button from the Edit Prompt form** — deleting a prompt is still
  available from the prompts list; the edit form no longer has its own delete action.
- **Fix Vue "Failed to resolve component" warnings** on the Edit Prompt page — the "tips"
  section's XML-tag examples (`<my_data>`, `<my_code>`, `<code_docs>`) were written as raw
  tags in the template, so Vue tried to resolve them as components. Escaped as HTML
  entities so they render as visible example text instead.
- **Prompt Improver**: new `prompt-improver` agent (`server/agents/prompt-improver/agent.md`)
  and `POST /api/prompts/improve`, which rewrites a prompt's `content` via that agent
  without touching the database. Added an "Improve" button to the Edit Prompt form that
  fills the Content field with the result; the user still has to click Save to persist it.
  Along the way, found and fixed a real prompt-quality bug where the agent would sometimes
  echo its own system prompt's illustrative example instead of rewriting the user's actual
  prompt.
- **Prompt list actions**: replaced the "Edit"/"Delete" text links in the prompts table
  with icon buttons (pencil / trash), keeping `aria-label`s for accessibility.
- **Agents refactor**: `server/lib/agents.ts` now dynamically loads agent system prompts
  from `server/agents/<name>/agent.md` instead of a hardcoded object, so adding a new agent
  is just adding a new directory. Added a `getAgent()` helper for safe lookups. (Hit and
  fixed a real bug here: an `import.meta.url`-based path broke under Nitro's server
  bundling — switched to a `process.cwd()`-relative path.)

## 2026-07-15

- **Chat-streaming and Prompts pages redesign**: reused the Stitch-generated design system
  from the index page redesign (indigo/Inter/JetBrains Mono) across `chat-streaming.vue`
  and all three prompts pages (`index.vue`, `new.vue`, `[id].vue`). Added a shared top nav
  layout (`app/layouts/app.vue`) with active-route highlighting. Chat messages now render
  as left/right bubbles instead of a plain list; the prompts table got styled tag chips and
  a consistent button/form treatment.
- Added Playwright as the project's e2e test tool, with specs covering the chat-streaming
  send flow and the full prompts create → edit → delete flow. Found and fixed a real
  hydration-timing race in the prompts edit flow (the edit page's async prompt fetch could
  resolve after a test had already started typing, overwriting the typed value).
- Fixed a table layout bug on the prompts list page: the Actions `<td>` had `display: flex`
  directly on it, which broke the row's border/height alignment with its sibling cells.
