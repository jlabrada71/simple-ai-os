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

## Database migrations

Migrations are Drizzle Kit-generated SQL, split by schema group:

- `npm run db:generate:public` / `npm run db:generate:tenant` — generate new migration files
  after changing `server/db/schema/public.ts` / `server/db/schema/tenant.ts`.
- `npm run db:migrate` — applies public-schema migrations manually (the app also applies them
  automatically on first request via `server/plugins/migrate.ts`).
- Tenant-schema migrations are applied by `db:provision-tenant` at provisioning time.

## Local domains

Tenant subdomains resolve via the `*.localhost` convention (no `/etc/hosts` needed) in
development: `http://acme.localhost:3000`. In production, tenants are served at
`{slug}.simple-ai-os.tryyourideas.com`.
