# ADR-0004: Multi-tenancy via schema-per-tenant Postgres

## Status

Proposed (target architecture — `07-target-architecture.md`)

## Context

`simple-ai-os` is currently single-tenant: `prompts` and `prompt_history` live in one
shared Postgres schema, and conversation state lives in `unstorage` filesystem namespaces.
To serve multiple customers ("tenants") with isolated data, we must choose a tenancy model.

Two workspace facts constrain the choice:

- `web/home` — the workspace's main multi-tenant product — already uses **schema-per-tenant**
  Postgres (`public.tenants` registry + `tenant_<slug>` schemas), with proven tooling:
  `server/middleware/tenant.ts` (subdomain resolution), `server/db/client.ts`
  (`getTenantDb` cached per-schema pools with a fixed `search_path`), and
  `server/db/scripts/provision-tenant.ts` (create schema + run migrations with
  `migrationsSchema = schemaName`).
- The workspace's stated conventions (`web/CLAUDE.md`) are Postgres 18 + Drizzle, and
  "reuse over rebuild" (see `ADR-shared-libraries-directory.md`).

## Decision

Adopt **schema-per-tenant** Postgres for `simple-ai-os`, mirroring `web/home`:

- A **public** schema holds a `tenants` registry (`id`, `slug`, `schema_name`,
  `company_name`, `created_at`).
- Each tenant owns its own Postgres **schema** (`tenant_<slug>`) containing the
  application tables (`prompts`, `prompt_history`, `users`, `threads`, `messages`).
- Tenant resolution is by request `Host` subdomain (e.g. `acme.simple-ai-os.example` →
  `tenant_acme`), via a Nitro middleware that sets `event.context.tenant`.
- Data access goes through a cached per-schema Drizzle client whose connection pool
  fixes `search_path = tenant_<slug>, public`, so no per-query schema juggling is needed
  and cross-tenant leakage is structurally impossible without an explicitly
  schema-qualified query.
- Tenant provisioning is a script (`provision-tenant.ts`) that inserts the registry row,
  creates the schema, applies the tenant Drizzle migrations (each schema tracking its own
  applied-migration journal via `migrationsSchema`), and seeds the owner.

## Alternatives considered

- **Shared schema + `tenant_id` column (row-level)**: simplest, but every query and index
  needs the discriminator, isolation relies on every developer remembering the filter, and
  it diverges from the `home` pattern the team already operates.
- **Database-per-tenant**: strongest isolation, but the heaviest operations (per-tenant
  database/credentials, connection limits, more moving parts) for no benefit over
  schema-per-tenant at this scale.
- **Service-per-tenant deployment**: rejected — overkill; tenancy is a data concern, not a
  deployment concern, for this product.

## Consequences

- **Positive:** strong isolation by construction; per-tenant backup/restore is a single
  schema; matches `home` so the team has one mental model to maintain.
- **Positive:** cross-tenant data leaks require an explicit schema-qualified query — an
  error that is easy to spot in review, rather than a forgotten `WHERE tenant_id = …`.
- **Cost:** provisioning must create schema + run migrations per tenant (the script does
  this); schema-count growth needs monitoring if tenant counts become large (hundreds+).
- **Cost:** `prompt_history`'s existing `prompt_id` "no FK" semantics and unique
  `prompts.name` become per-schema (per-tenant) rather than global — uniqueness of a
  prompt name is now scoped to the tenant, which is the desired behavior.
- **Open:** single shared `iam` app registration vs. per-tenant (see `07` §7.1) — if
  tenants own their `iam` registration, tenant provisioning must also register a client
  in `iam`.
