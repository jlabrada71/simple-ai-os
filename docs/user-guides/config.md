# Configuration

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key used by `server/lib/agent.ts` / `agent-streaming.ts`. |
| `AGENT_BASE_URL` | No | Overrides the Anthropic client's base URL (streaming client only) — points at a local Anthropic-API-shaped service instead of the real API. |
| `DATABASE_URL` | Yes | Postgres connection string, e.g. `postgres://user:pass@host:5432/simple-ai-os`. |
| `NUXT_IAM_URL` | Yes (for SSO) | Base URL of the `iam` instance (e.g. `https://iam.tryyourideas.com`). |
| `NUXT_IAM_CLIENT_ID` | Yes (for provisioning) | The `iam` client ID used to register a per-tenant app during `db:provision-tenant`. |
| `NUXT_IAM_CLIENT_API_SECRET` | Yes (for provisioning) | Bearer secret authenticating that client's app-registration calls to `iam`. |
| `NUXT_TENANT_SECRET_ENCRYPTION_KEY` | Yes | 64-character hex string (32 bytes) used to encrypt each tenant's `iam` client secret at rest. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `NUXT_ADMIN_API_KEY` | Yes (for cross-app provisioning) | Shared secret authenticating server-to-server calls to `POST /api/admin/tenants` (`x-admin-api-key` header). Must exactly match `home`'s `NUXT_SIMPLE_AI_OS_ADMIN_API_KEY` for that environment. Generate with `openssl rand -hex 32`. |

## Tenant provisioning

Each tenant is a Postgres schema (`tenant_<slug>`) plus its own `iam` app registration. Provision one with:

```bash
npm run db:provision-tenant -- --slug acme --name "Acme Co"
```

This creates the `public.tenants` registry row, the `tenant_acme` schema, runs that schema's
migrations, and registers a `simple-ai-os` app for the tenant in `iam` (storing the returned
`app_id`/`client_secret` encrypted in that tenant's `tenant_config` table).

No owner user is seeded — the first person to complete SSO login for that tenant becomes its
owner automatically (`role: 'member'`; promoting to `role: 'admin'` is a manual DB update in
this phase — see `docs/backlog.md`).

### Cross-app provisioning from `home`

`web/home` provisions a matching tenant here automatically whenever it provisions its own tenant
(see `home/docs/user-guides/config.md`'s "Cross-app tenant provisioning" section) — this CLI
command and `home`'s call both go through the same underlying `provisionTenant()` function
(`server/lib/provisionTenant.ts`), so both are idempotent and safe to run more than once for the
same slug (a repeat call reports `alreadyExisted: true` instead of erroring).

The same logic is also reachable as an HTTP endpoint for that cross-app call:

```bash
curl -X POST https://simple-ai-os.tryyourideas.com/api/admin/tenants \
  -H "x-admin-api-key: $NUXT_ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{"slug":"acme","name":"Acme Co"}'
```

There's normally no need to call this by hand — `home`'s own admin **Tenants** page triggers it.
It exists as a manual fallback (e.g. retrying a tenant `home`'s automatic call failed to
provision here, without re-running `home`'s own provisioning). See
`docs/architecture/ADR/0006-cross-app-tenant-provisioning-shared-key.md`.

## Database migrations

Migrations are Drizzle Kit-generated SQL, split by schema group:

- `npm run db:generate:public` / `npm run db:generate:tenant` — generate new migration files
  after changing `server/db/schema/public.ts` / `server/db/schema/tenant.ts`.
- `npm run db:migrate` — applies public-schema migrations manually (the app also applies them
  automatically on first request via `server/plugins/migrate.ts`).
- Tenant-schema migrations are applied by `db:provision-tenant` at provisioning time.

## Chat history

Conversation history lives in the tenant's own `threads`/`messages` tables (Postgres), keyed to
the authenticated `tenant.users` row — not a cookie. The old `data/sessions/` fs directory is no
longer used.

## API keys

Any tenant-scoped endpoint (`/api/threads/**`, `/api/prompts/**`, `/api/agent`,
`/api/agent-stream`, and `/mcp`) accepts a personal API key as an alternative to a browser
session cookie — useful for scripts, integrations, or MCP clients that can't hold a cookie.

- **Create one** (requires an active browser session — a key can't be used to mint another key):
  `POST /api/api-keys` with an optional `{ "name": "..." }` body. The plaintext token
  (`sao_...`) is returned exactly once; only its hash is stored.
- **Use one**: send `Authorization: Bearer <token>` on any request instead of relying on the
  session cookie. The key inherits exactly the permissions of the user it belongs to.
- **List/revoke**: `GET /api/api-keys` (never returns the token, only id/name/`createdAt`/
  `lastUsedAt`), `DELETE /api/api-keys/:id`.

There's no UI for this yet (see `docs/backlog.md`'s "API key management UI") — these are called
directly.

## Local domains

Tenant subdomains resolve via the `*.localhost` convention (no `/etc/hosts` needed) in
development: `http://acme.localhost:3000`. In production, tenants are served at
`{slug}.simple-ai-os.tryyourideas.com`.
