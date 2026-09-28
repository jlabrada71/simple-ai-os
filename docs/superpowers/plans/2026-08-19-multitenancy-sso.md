# simple-ai-os Multitenancy + iam SSO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `simple-ai-os` schema-per-tenant multitenant and delegate authentication to `iam` via `lib/nuxt-iam-client`, mirroring the proven patterns already running in production in `web/home`.

**Architecture:** A `public.tenants` registry maps subdomains to `tenant_<slug>` Postgres schemas; a Nitro middleware resolves `event.context.tenant` from the `Host` header on every request; a per-schema connection-pool cache (`getTenantDb`/`withTenantDb`) gives tenant-scoped Drizzle access with no per-query schema juggling. `nuxt-iam-client` is mounted in `dynamic` mode (one mount, credentials resolved per-tenant from a `tenant_config` row) so each tenant owns its own `iam` `app_id`/`client_secret`, registered by a provisioning script that also creates the tenant's schema and runs its migrations.

**Tech Stack:** Nuxt 4 / Nitro, Drizzle ORM (`drizzle-orm/node-postgres` + `pg`), Drizzle Kit, Postgres 18, `lib/nuxt-iam-client` (local Nuxt module), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-multitenancy-sso-design.md`

---

## File structure

| File | Responsibility |
|---|---|
| `server/db/schema/public.ts` | `tenants` registry table (new location, replaces `server/db/schema.ts`) |
| `server/db/schema/tenant.ts` | `prompts`, `promptHistory` (moved), `users`, `tenantConfig` (new) — everything that lives inside a tenant schema |
| `server/db/client.ts` | `publicDb`, `getTenantDb`/`withTenantDb` (rewritten for per-schema pooling) |
| `drizzle.config.public.ts`, `drizzle.config.tenant.ts` | Drizzle Kit config per schema group (new) |
| `server/db/migrations/public/**`, `server/db/migrations/tenant/**` | generated SQL migrations (new) |
| `server/utils/tenant.ts` | `resolveTenant(event)` — subdomain → `TenantContext` (new) |
| `server/middleware/tenant.ts` | sets `event.context.tenant` on every request (new) |
| `server/plugins/migrate.ts` | runs public-schema migrations lazily on first request (new) |
| `server/utils/migrate.ts` | `runPublicMigrations`/`runTenantMigrations` helpers (new) |
| `server/db/scripts/provision-tenant.ts` | CLI: create tenant row + schema + migrate + register `iam` app (new) |
| `server/utils/tenantSecretCrypto.ts` | AES-256-GCM encrypt/decrypt for the stored `iam` client secret (new, ported from `home`) |
| `server/utils/tenantIamConfig.ts` | read/write a tenant's `iam` app config in `tenant_config` (new, ported from `home`) |
| `server/utils/tenantIamRegistration.ts` | calls `iam`'s `POST /api/clients/:clientId/apps` (new, ported from `home`) |
| `server/utils/resolveTenantIam.ts` | `resolveIamAppCredentials(event)` — the `nuxt-iam-client` dynamic-mode contract (new) |
| `server/utils/requireTenantSession.ts` | auth guard: resolves `{ tenant, user }` or throws 401/404 (new) |
| `server/api/auth/session.get.ts` | app-level session check (iam session + tenant membership, auto-creates `users` row on first login) (new) |
| `nuxt.config.ts` | mount `nuxt-iam-client`, register `server/db/migrations/*` as `serverAssets` |
| `server/lib/prompts.ts` | modified: every function takes `db` as its first parameter |
| `server/api/prompts/**/*.ts` | modified: resolve tenant db from `event.context.tenant`, pass into `prompts.ts` |
| `server/lib/agent.ts`, `server/lib/agent-streaming.ts` | modified: `chat(db, sessionId, ...)` — tenant db threaded through for MCP prompt resolution |
| `server/api/agent.post.ts`, `server/api/agent-stream.post.ts` | modified: call `requireTenantSession`, drop `initSession` stub |
| `server/mcp/server.ts`, `server/routes/mcp.post.ts` | modified: `createMcpServer(db)`, resolves tenant db from `event.context.tenant` |
| `server/lib/session.ts`, `server/api/login.ts`, `server/api/new-thread.ts` | **deleted** |
| `app/pages/login.vue`, `app/pages/authenticated.vue`, `app/pages/not-authenticated.vue` | new pages for the SSO flow |
| `app/composables/useAuth.ts` | app-level auth composable wrapping `/api/auth/session` (new) |
| `app/middleware/auth.ts` | route guard for `chat.vue`/`chat-streaming.vue`/`prompts/*` (new) |
| `.env.example` | add `NUXT_IAM_URL`, `NUXT_IAM_CLIENT_ID`, `NUXT_IAM_CLIENT_API_SECRET`, `NUXT_TENANT_SECRET_ENCRYPTION_KEY` |

---

### Task 1: Public/tenant schema split

**Files:**
- Create: `server/db/schema/public.ts`
- Create: `server/db/schema/tenant.ts`
- Delete: `server/db/schema.ts`
- Modify: any importer of `server/db/schema` (grep after the move)
- Test: `server/db/schema/tenant.test.ts`

- [ ] **Step 1: Write the failing test for the new schema module locations**

```ts
// server/db/schema/tenant.test.ts
import { describe, expect, it } from 'vitest'
import { prompts, promptHistory, users, tenantConfig } from './tenant'

describe('tenant schema', () => {
  it('exports the tenant-scoped tables', () => {
    expect(prompts).toBeDefined()
    expect(promptHistory).toBeDefined()
    expect(users).toBeDefined()
    expect(tenantConfig).toBeDefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/db/schema/tenant.test.ts`
Expected: FAIL — `Cannot find module './tenant'`

- [ ] **Step 3: Create `server/db/schema/public.ts`**

```ts
import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  schemaName: text('schema_name').notNull().unique(),
  companyName: text('company_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
```

- [ ] **Step 4: Create `server/db/schema/tenant.ts`** (moves `prompts`/`promptHistory` verbatim from the old `server/db/schema.ts`, adds `users` and `tenantConfig`)

```ts
import { sql } from 'drizzle-orm'
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const prompts = pgTable('prompts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull().unique(),
  content: text('content').notNull(),
  description: text('description'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  variables: text('variables').array().notNull().default(sql`'{}'::text[]`),
  version: integer('version').notNull().default(1),
  score: integer('score').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export type Prompt = typeof prompts.$inferSelect
export type NewPrompt = typeof prompts.$inferInsert

export const promptHistory = pgTable('prompt_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  promptId: uuid('prompt_id').notNull(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  description: text('description'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  variables: text('variables').array().notNull().default(sql`'{}'::text[]`),
  version: integer('version').notNull(),
  score: integer('score').notNull().default(0),
  action: text('action').notNull().$type<'updated' | 'deleted'>(),
  promptCreatedAt: timestamp('prompt_created_at', { withTimezone: true }).notNull(),
  promptUpdatedAt: timestamp('prompt_updated_at', { withTimezone: true }).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export type PromptHistoryEntry = typeof promptHistory.$inferSelect
export type NewPromptHistoryEntry = typeof promptHistory.$inferInsert

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  iamSub: text('iam_sub').notNull().unique(),
  email: text('email').notNull(),
  role: text('role').notNull().$type<'member' | 'admin'>().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export type TenantUser = typeof users.$inferSelect
export type NewTenantUser = typeof users.$inferInsert

// Keyed store for per-tenant integration config (e.g. the tenant's own `iam`
// app_id/client_secret) - key 'iam_integration' holds one entry per
// applicationName so multiple apps (this one, and later others) can each
// register their own iam app for the same tenant without colliding.
export const tenantConfig = pgTable('tenant_config', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  key: text('key').notNull().unique(),
  value: jsonb('value').notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
})
```

- [ ] **Step 5: Delete `server/db/schema.ts`, run `grep -rn "db/schema'" server/ shared/` and fix every importer** to import from `server/db/schema/tenant` (for `prompts`/`promptHistory`/`Prompt`/`PromptHistoryEntry`) or `server/db/schema/public` (for `tenants`). At this point in the plan the only importers are `server/lib/prompts.ts` and its test — leave those imports as-is for now, Task 8 rewrites `prompts.ts` itself.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run server/db/schema/tenant.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/db/schema/public.ts server/db/schema/tenant.ts server/db/schema/tenant.test.ts
git rm server/db/schema.ts
git commit -m "feat: split db schema into public and tenant modules"
```

---

### Task 2: Tenant-scoped DB client

**Files:**
- Modify: `server/db/client.ts`
- Test: `server/db/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/db/client.test.ts
import { describe, expect, it } from 'vitest'
import { getTenantDb } from './client'

describe('getTenantDb', () => {
  it('returns the same cached client for the same schema name', () => {
    const a = getTenantDb('tenant_acme')
    const b = getTenantDb('tenant_acme')
    expect(a).toBe(b)
  })

  it('returns a different client for a different schema name', () => {
    const a = getTenantDb('tenant_acme')
    const b = getTenantDb('tenant_other')
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/db/client.test.ts`
Expected: FAIL — `getTenantDb` is not exported

- [ ] **Step 3: Rewrite `server/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/simple-ai-os'

export const db = new Pool({ connectionString })
export const publicDb = drizzle(db)

const tenantClients = new Map<string, ReturnType<typeof drizzle>>()

/**
 * Returns a cached Drizzle client for the given tenant schema, backed by a
 * dedicated connection pool whose search_path is fixed to that schema (with
 * public as fallback) via the libpq `-c search_path=...` startup option - so
 * every connection in the pool always queries the right tenant, no
 * per-query SET search_path needed. Mirrors web/home's server/db/client.ts,
 * adapted for the pg (node-postgres) driver this app already uses.
 */
export function getTenantDb(schemaName: string) {
  let client = tenantClients.get(schemaName)
  if (!client) {
    const pool = new Pool({
      connectionString,
      options: `-c search_path=${schemaName},public`,
    })
    client = drizzle(pool)
    tenantClients.set(schemaName, client)
  }
  return client
}

export async function withTenantDb<T>(
  schemaName: string,
  fn: (db: ReturnType<typeof drizzle>) => Promise<T>,
): Promise<T> {
  return fn(getTenantDb(schemaName))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/db/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/db/client.ts server/db/client.test.ts
git commit -m "feat: add per-tenant Drizzle client pooling"
```

---

### Task 3: Tenant resolution middleware

**Files:**
- Create: `server/utils/tenant.ts`
- Create: `server/middleware/tenant.ts`
- Test: `server/utils/tenant.test.ts`

- [ ] **Step 1: Write the failing test** (ports the slug-extraction cases documented in `home`'s learnings doc: apex hosts, `localhost`, bare IPv4, missing host)

```ts
// server/utils/tenant.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const selectMock = vi.fn()
vi.mock('../db/client', () => ({
  publicDb: { select: () => ({ from: () => ({ where: () => ({ limit: selectMock }) }) }) },
}))

import { resolveTenant } from './tenant'
import type { H3Event } from 'h3'

function eventWithHost(host: string | undefined): H3Event {
  return { node: { req: { headers: { host } } } } as unknown as H3Event
}

describe('resolveTenant', () => {
  beforeEach(() => {
    selectMock.mockReset()
  })

  it('returns null for the apex hostname', async () => {
    expect(await resolveTenant(eventWithHost('simple-ai-os.tryyourideas.com'))).toBeNull()
  })

  it('returns null for localhost', async () => {
    expect(await resolveTenant(eventWithHost('localhost:3000'))).toBeNull()
  })

  it('returns null for a bare IPv4 host', async () => {
    expect(await resolveTenant(eventWithHost('127.0.0.1:3000'))).toBeNull()
  })

  it('returns null when the host header is missing', async () => {
    expect(await resolveTenant(eventWithHost(undefined))).toBeNull()
  })

  it('404s on an unknown tenant slug', async () => {
    selectMock.mockResolvedValue([])
    await expect(resolveTenant(eventWithHost('unknown.simple-ai-os.tryyourideas.com'))).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('resolves a known tenant slug', async () => {
    selectMock.mockResolvedValue([{ id: '1', slug: 'acme', schemaName: 'tenant_acme', companyName: 'Acme' }])
    const ctx = await resolveTenant(eventWithHost('acme.simple-ai-os.tryyourideas.com'))
    expect(ctx).toEqual({ id: '1', slug: 'acme', schemaName: 'tenant_acme', companyName: 'Acme' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/utils/tenant.test.ts`
Expected: FAIL — `Cannot find module './tenant'`

- [ ] **Step 3: Create `server/utils/tenant.ts`** (direct port of `home`'s `server/utils/tenant.ts`, apex list updated for this app's domains)

```ts
import { eq } from 'drizzle-orm'
import { getHeader, createError } from 'h3'
import type { H3Event } from 'h3'
import { publicDb } from '../db/client'
import { tenants } from '../db/schema/public'

export interface TenantContext {
  id: string
  slug: string
  schemaName: string
  companyName: string
}

const tenantCache = new Map<string, TenantContext>()

const APEX_HOSTNAMES = new Set([
  'simple-ai-os.tryyourideas.com',
  'localhost',
])

const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

function extractSlug(host: string | undefined): string | null {
  if (!host) return null

  const hostname = host.split(':')[0]
  if (APEX_HOSTNAMES.has(hostname)) return null

  // IP addresses (e.g. 127.0.0.1, used by local dev servers and test
  // runners like @nuxt/test-utils) are never tenant subdomains - without
  // this check "127" would be parsed as a slug and fail tenant lookup.
  if (IPV4_REGEX.test(hostname)) return null

  const parts = hostname.split('.')
  if (parts.length < 2) return null

  return parts[0]
}

/**
 * Resolves the tenant for the current request from the Host header.
 * Returns null for the apex site (no subdomain) - callers that require a
 * tenant (login, chat, prompts, mcp) reject when this is null.
 */
export async function resolveTenant(event: H3Event): Promise<TenantContext | null> {
  const slug = extractSlug(getHeader(event, 'host'))
  if (!slug) return null

  const cached = tenantCache.get(slug)
  if (cached) return cached

  const [row] = await publicDb.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown tenant' })
  }

  const context: TenantContext = {
    id: row.id,
    slug: row.slug,
    schemaName: row.schemaName,
    companyName: row.companyName,
  }
  tenantCache.set(slug, context)
  return context
}
```

- [ ] **Step 4: Create `server/middleware/tenant.ts`**

```ts
import { resolveTenant } from '../utils/tenant'

declare module 'h3' {
  interface H3EventContext {
    tenant: Awaited<ReturnType<typeof resolveTenant>>
  }
}

export default defineEventHandler(async (event) => {
  event.context.tenant = await resolveTenant(event)
})
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run server/utils/tenant.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/utils/tenant.ts server/utils/tenant.test.ts server/middleware/tenant.ts
git commit -m "feat: resolve tenant from request Host header"
```

---

### Task 4: Drizzle Kit config + generate migrations

**Files:**
- Create: `drizzle.config.public.ts`
- Create: `drizzle.config.tenant.ts`
- Create: `server/db/migrations/public/**`, `server/db/migrations/tenant/**` (generated)
- Modify: `package.json` (add `drizzle-kit`, `tsx`, `db:generate:*` scripts)
- Delete: `docker/init.sql` (superseded by migrations)
- Modify: `docker-compose.yml` (drop the `init.sql` bind mount)

- [ ] **Step 1: Add dependencies**

```bash
npm install --save-dev drizzle-kit@^0.31.0 tsx@^4.19.0
```

- [ ] **Step 2: Create `drizzle.config.public.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/db/schema/public.ts',
  out: './server/db/migrations/public',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/simple-ai-os',
  },
})
```

- [ ] **Step 3: Create `drizzle.config.tenant.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/db/schema/tenant.ts',
  out: './server/db/migrations/tenant',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/simple-ai-os',
  },
})
```

- [ ] **Step 4: Add `package.json` scripts**

```json
"db:generate:public": "drizzle-kit generate --config drizzle.config.public.ts",
"db:generate:tenant": "drizzle-kit generate --config drizzle.config.tenant.ts",
"db:migrate": "tsx server/db/scripts/migrate-public.ts",
"db:provision-tenant": "tsx server/db/scripts/provision-tenant.ts"
```

- [ ] **Step 5: Generate the migrations**

```bash
npm run db:generate:public
npm run db:generate:tenant
```

Expected: `server/db/migrations/public/0000_*.sql` (creates `tenants`) and
`server/db/migrations/tenant/0000_*.sql` (creates `prompts`, `prompt_history`, `users`,
`tenant_config`) are created, each with a `meta/` folder and `_journal.json`.

- [ ] **Step 6: Delete `docker/init.sql`, remove its bind mount from `docker-compose.yml`**

In `docker-compose.yml`, remove this line from the `postgres` service's `volumes:`:
```yaml
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
```
(Table creation is now owned by Drizzle migrations, run by the boot plugin and the
provisioning script — Task 5 and Task 6.)

- [ ] **Step 7: Commit**

```bash
git add drizzle.config.public.ts drizzle.config.tenant.ts server/db/migrations package.json package-lock.json docker-compose.yml
git rm docker/init.sql
git commit -m "feat: add Drizzle Kit migrations for public and tenant schemas"
```

---

### Task 5: Migration runner + boot plugin

**Files:**
- Create: `server/utils/migrate.ts`
- Create: `server/plugins/migrate.ts`
- Create: `server/db/scripts/migrate-public.ts`
- Modify: `nuxt.config.ts` (register `server/db/migrations/{public,tenant}` as `serverAssets`)
- Test: `server/utils/migrate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/utils/migrate.test.ts
import { describe, expect, it, vi } from 'vitest'

const migrateMock = vi.fn().mockResolvedValue(undefined)
vi.mock('drizzle-orm/node-postgres/migrator', () => ({ migrate: migrateMock }))
vi.mock('../db/client', () => ({ publicDb: {}, db: {} }))

import { runPublicMigrations } from './migrate'

describe('runPublicMigrations', () => {
  it('materializes the storage-backed migration assets to a temp dir and runs migrate() against it', async () => {
    const storage = {
      getKeys: async () => ['0000_init.sql', 'meta:_journal.json'],
      getItem: async (key: string) =>
        key === 'meta:_journal.json' ? JSON.stringify({ entries: [{ tag: '0000_init' }] }) : 'CREATE TABLE x();',
    }

    await runPublicMigrations(storage)

    expect(migrateMock).toHaveBeenCalledTimes(1)
    const [, options] = migrateMock.mock.calls[0]
    expect(options.migrationsFolder).toEqual(expect.any(String))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/utils/migrate.test.ts`
Expected: FAIL — `Cannot find module './migrate'`

- [ ] **Step 3: Create `server/utils/migrate.ts`** (ported from `home`'s `server/utils/migrate.ts`, using `drizzle-orm/node-postgres`/`pg` instead of `postgres-js`; the temp-dir materialization step exists because Nitro's `serverAssets` are only readable through `useStorage`, not as real files on disk, once the app is built for production)

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { publicDb } from '../db/client'

export interface MigrationStorage {
  getKeys(): Promise<string[]> | string[]
  getItem(key: string): Promise<unknown> | unknown
}

async function materializeMigrationAssets(storage: MigrationStorage): Promise<string> {
  const keys = await storage.getKeys()
  const dir = mkdtempSync(join(tmpdir(), 'migrations-'))

  for (const key of keys) {
    const relativePath = key.replace(/:/g, '/')
    const content = await storage.getItem(key)
    const filePath = join(dir, relativePath)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content))
  }

  return dir
}

export async function runPublicMigrations(storage: MigrationStorage): Promise<void> {
  const dir = await materializeMigrationAssets(storage)
  await migrate(publicDb, { migrationsFolder: dir })
}

export async function runTenantMigrations(schemaName: string, storage: MigrationStorage): Promise<void> {
  const dir = await materializeMigrationAssets(storage)
  const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/simple-ai-os'
  const pool = new Pool({ connectionString, max: 1, options: `-c search_path=${schemaName},public` })
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: dir,
      // Each tenant tracks its own applied migrations inside its own schema -
      // Drizzle's bookkeeping table defaults to a fixed "drizzle" schema
      // shared database-wide, so without this every tenant after the first
      // silently skips its own CREATE TABLE statements (see
      // docs/learnings/learnings.md in web/home for the failure mode).
      migrationsSchema: schemaName,
    })
  } finally {
    await pool.end()
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/utils/migrate.test.ts`
Expected: PASS

- [ ] **Step 5: Register migrations as `serverAssets` in `nuxt.config.ts`** — add inside the existing `nitro: { ... }` block:

```ts
  nitro: {
    serverAssets: [
      { baseName: 'migrationsPublic', dir: fileURLToPath(new URL('./server/db/migrations/public', import.meta.url)) },
      { baseName: 'migrationsTenant', dir: fileURLToPath(new URL('./server/db/migrations/tenant', import.meta.url)) },
    ],
    storage: {
      session: { driver: 'fs', base: './data/sessions' },
    },
    routeRules: {
      '/mcp': { cors: true },
    },
  },
```

Add `import { fileURLToPath } from 'node:url'` to the top of `nuxt.config.ts`.

- [ ] **Step 6: Create `server/plugins/migrate.ts`** (ported from `home`, including the "never `process.exit()` from a per-request hook" lesson baked in from the start — see `home`'s `docs/learnings/learnings.md` for what happens if you skip this)

```ts
import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { getHeader, createError } from 'h3'
import { runPublicMigrations } from '../utils/migrate'

export default defineNitroPlugin((nitroApp) => {
  let migrationPromise: Promise<void> | null = null

  nitroApp.hooks.hook('request', async (event) => {
    if (getHeader(event, 'x-nitro-prerender')) return

    if (!migrationPromise) {
      migrationPromise = runPublicMigrations(useStorage('assets:migrationsPublic'))
        .then(() => console.log('Public schema migrations applied'))
        .catch((error) => {
          console.error('Public schema migration failed:', error)
          migrationPromise = null
          throw error
        })
    }

    try {
      await migrationPromise
    } catch {
      throw createError({
        statusCode: 503,
        statusMessage: 'Service temporarily unavailable: database migration failed',
      })
    }
  })
})
```

- [ ] **Step 7: Create `server/db/scripts/migrate-public.ts`** (manual CLI entry point, for deploys/CI that prefer running migrations explicitly instead of relying on the lazy boot plugin)

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/simple-ai-os'
  const pool = new Pool({ connectionString, max: 1 })
  await migrate(drizzle(pool), { migrationsFolder: './server/db/migrations/public' })
  await pool.end()
  console.log('Public schema migrations applied')
}

main().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
```

- [ ] **Step 8: Commit**

```bash
git add server/utils/migrate.ts server/utils/migrate.test.ts server/plugins/migrate.ts server/db/scripts/migrate-public.ts nuxt.config.ts
git commit -m "feat: run public schema migrations on boot"
```

---

### Task 6: Tenant secret crypto + iam registration + provisioning script

**Files:**
- Create: `server/utils/tenantSecretCrypto.ts`
- Create: `server/utils/tenantIamConfig.ts`
- Create: `server/utils/tenantIamRegistration.ts`
- Create: `server/db/scripts/provision-tenant.ts`
- Modify: `.env.example`
- Test: `server/utils/tenantSecretCrypto.test.ts`, `server/utils/tenantIamConfig.test.ts`

- [ ] **Step 1: Write the failing crypto round-trip test**

```ts
// server/utils/tenantSecretCrypto.test.ts
import { describe, expect, it, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'

beforeAll(() => {
  process.env.NUXT_TENANT_SECRET_ENCRYPTION_KEY = randomBytes(32).toString('hex')
})

import { encryptSecret, decryptSecret } from './tenantSecretCrypto'

describe('tenantSecretCrypto', () => {
  it('round-trips a plaintext value', () => {
    const encrypted = encryptSecret('super-secret-value')
    expect(encrypted).not.toBe('super-secret-value')
    expect(decryptSecret(encrypted)).toBe('super-secret-value')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/utils/tenantSecretCrypto.test.ts`
Expected: FAIL — `Cannot find module './tenantSecretCrypto'`

- [ ] **Step 3: Create `server/utils/tenantSecretCrypto.ts`** (direct port of `home`'s file — same algorithm, same env var name, for cross-workspace consistency)

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.NUXT_TENANT_SECRET_ENCRYPTION_KEY
  if (!hex) {
    throw new Error('NUXT_TENANT_SECRET_ENCRYPTION_KEY is not set')
  }
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error('NUXT_TENANT_SECRET_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return key
}

/** Returns `base64(iv):base64(authTag):base64(ciphertext)`. */
export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function decryptSecret(encrypted: string): string {
  const key = getKey()
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(':')
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Malformed encrypted secret')
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()])
  return plaintext.toString('utf8')
}
```

- [ ] **Step 4: Run the crypto test to verify it passes**

Run: `npx vitest run server/utils/tenantSecretCrypto.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing `tenantIamConfig` test**

```ts
// server/utils/tenantIamConfig.test.ts
import { describe, expect, it, vi, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'

beforeAll(() => {
  process.env.NUXT_TENANT_SECRET_ENCRYPTION_KEY = randomBytes(32).toString('hex')
})

import { storeTenantIamAppConfig, getTenantIamAppConfig } from './tenantIamConfig'

function fakeDb() {
  let stored: { key: string; value: unknown } | null = null
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (stored ? [stored] : []),
        }),
      }),
    }),
    insert: () => ({
      values: (row: { key: string; value: unknown }) => {
        stored = row
        return {
          onConflictDoUpdate: async ({ set }: { set: { value: unknown } }) => {
            stored = { key: row.key, value: set.value }
          },
        }
      },
    }),
  }
}

describe('tenantIamConfig', () => {
  it('round-trips an app config for a given applicationName, encrypting the client secret at rest', async () => {
    const db = fakeDb() as any
    await storeTenantIamAppConfig(db, 'simple-ai-os', {
      appId: 'app-1',
      clientSecret: 'top-secret',
      authenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/authenticated',
      notAuthenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/not-authenticated',
    })

    const config = await getTenantIamAppConfig(db, 'simple-ai-os')
    expect(config).toEqual({
      appId: 'app-1',
      clientSecret: 'top-secret',
      authenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/authenticated',
      notAuthenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/not-authenticated',
    })
  })

  it('returns null for an unregistered applicationName', async () => {
    const db = fakeDb() as any
    expect(await getTenantIamAppConfig(db, 'simple-ai-os')).toBeNull()
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run server/utils/tenantIamConfig.test.ts`
Expected: FAIL — `Cannot find module './tenantIamConfig'`

- [ ] **Step 7: Create `server/utils/tenantIamConfig.ts`** (ported from `home`, using this app's `tenantConfig` table)

```ts
import { eq } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { tenantConfig } from '../db/schema/tenant'
import { encryptSecret, decryptSecret } from './tenantSecretCrypto'

const IAM_INTEGRATION_KEY = 'iam_integration'

export interface TenantIamAppConfig {
  appId: string
  clientSecret: string
  authenticatedUrl: string
  notAuthenticatedUrl: string
}

type TenantDb = ReturnType<typeof drizzle>

interface StoredIamIntegration {
  [applicationName: string]: {
    appId: string
    clientSecretEncrypted: string
    authenticatedUrl: string
    notAuthenticatedUrl: string
    registeredAt: string
  }
}

async function readIamIntegration(db: TenantDb): Promise<StoredIamIntegration> {
  try {
    const [row] = await db.select().from(tenantConfig).where(eq(tenantConfig.key, IAM_INTEGRATION_KEY)).limit(1)
    return (row?.value as StoredIamIntegration | undefined) ?? {}
  } catch (error) {
    const cause = error instanceof Error ? (error as { cause?: { code?: string } }).cause : undefined
    if (cause?.code === '42P01') return {}
    throw error
  }
}

export async function storeTenantIamAppConfig(
  db: TenantDb,
  applicationName: string,
  app: { appId: string; clientSecret: string; authenticatedUrl: string; notAuthenticatedUrl: string },
): Promise<void> {
  const existing = await readIamIntegration(db)
  const value: StoredIamIntegration = {
    ...existing,
    [applicationName]: {
      appId: app.appId,
      clientSecretEncrypted: encryptSecret(app.clientSecret),
      authenticatedUrl: app.authenticatedUrl,
      notAuthenticatedUrl: app.notAuthenticatedUrl,
      registeredAt: new Date().toISOString(),
    },
  }

  await db
    .insert(tenantConfig)
    .values({ key: IAM_INTEGRATION_KEY, value })
    .onConflictDoUpdate({ target: tenantConfig.key, set: { value, updatedAt: new Date() } })
}

export async function getTenantIamAppConfig(db: TenantDb, applicationName: string): Promise<TenantIamAppConfig | null> {
  const integration = await readIamIntegration(db)
  const entry = integration[applicationName]
  if (!entry) return null
  return {
    appId: entry.appId,
    clientSecret: decryptSecret(entry.clientSecretEncrypted),
    authenticatedUrl: entry.authenticatedUrl,
    notAuthenticatedUrl: entry.notAuthenticatedUrl,
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run server/utils/tenantIamConfig.test.ts`
Expected: PASS

- [ ] **Step 9: Create `server/utils/tenantIamRegistration.ts`** (ported from `home`, dev origin uses this app's `*.localhost:3000` convention, prod uses `{slug}.simple-ai-os.tryyourideas.com`)

```ts
export interface RegisterTenantIamAppInput {
  appName: string
  slug: string
}

export interface RegisteredTenantIamApp {
  appId: string
  clientSecret: string
  authenticatedUrl: string
  notAuthenticatedUrl: string
}

function tenantOrigin(slug: string): string {
  const isDev = process.env.NODE_ENV !== 'production'
  return isDev ? `http://${slug}.localhost:3000` : `https://${slug}.simple-ai-os.tryyourideas.com`
}

export async function registerTenantIamApp(input: RegisterTenantIamAppInput): Promise<RegisteredTenantIamApp> {
  const iamUrl = (process.env.NUXT_IAM_URL || '').replace(/\/+$/, '')
  const clientId = process.env.NUXT_IAM_CLIENT_ID || ''
  const clientApiSecret = process.env.NUXT_IAM_CLIENT_API_SECRET || ''

  const origin = tenantOrigin(input.slug)
  const authenticatedUrl = `${origin}/authenticated`
  const notAuthenticatedUrl = `${origin}/not-authenticated`

  const response = await fetch(`${iamUrl}/api/clients/${clientId}/apps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${clientApiSecret}`,
    },
    body: JSON.stringify({ appName: input.appName, authenticatedUrl, notAuthenticatedUrl }),
  })

  if (!response.ok) {
    const error = (await response.json()) as { message?: string }
    throw new Error(error.message || `iam app registration failed with status ${response.status}`)
  }

  const data = (await response.json()) as {
    appId: string
    authenticatedUrl: string
    notAuthenticatedUrl: string
    clientSecret: string
  }

  return {
    appId: data.appId,
    clientSecret: data.clientSecret,
    authenticatedUrl: data.authenticatedUrl,
    notAuthenticatedUrl: data.notAuthenticatedUrl,
  }
}
```

- [ ] **Step 10: Create `server/db/scripts/provision-tenant.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { tenants } from '../schema/public'
import { registerTenantIamApp } from '../../utils/tenantIamRegistration'
import { getTenantIamAppConfig, storeTenantIamAppConfig } from '../../utils/tenantIamConfig'

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/simple-ai-os'

function parseArgs(): { slug: string; name: string } {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const index = args.indexOf(flag)
    return index === -1 ? undefined : args[index + 1]
  }

  const slug = get('--slug')
  const name = get('--name')

  if (!slug || !name) {
    console.error('Usage: npm run db:provision-tenant -- --slug <slug> --name "<Company Name>"')
    process.exit(1)
  }

  return { slug, name }
}

async function main() {
  const { slug, name } = parseArgs()
  const schemaName = `tenant_${slug}`

  const pool = new Pool({ connectionString, max: 1 })
  const db = drizzle(pool)
  await db.insert(tenants).values({ slug, schemaName, companyName: name })
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
  await pool.end()

  const tenantPool = new Pool({ connectionString, max: 1, options: `-c search_path=${schemaName},public` })
  const tenantDb = drizzle(tenantPool)
  await migrate(tenantDb, {
    migrationsFolder: './server/db/migrations/tenant',
    // Each tenant tracks its own applied migrations inside its own schema -
    // see docs/learnings/learnings.md for why this is required.
    migrationsSchema: schemaName,
  })

  const existingIamConfig = await getTenantIamAppConfig(tenantDb, 'simple-ai-os')
  if (!existingIamConfig) {
    const registered = await registerTenantIamApp({ appName: name, slug })
    await storeTenantIamAppConfig(tenantDb, 'simple-ai-os', registered)
    console.log(`Registered iam app "${registered.appId}" for tenant "${slug}"`)
  }

  await tenantPool.end()

  console.log(`Tenant "${slug}" provisioned with schema "${schemaName}"`)
  console.log('No owner user was seeded - the first person to complete SSO login becomes the tenant owner (role: member; promote to admin manually - see docs/backlog.md).')
}

main().catch((error) => {
  console.error('Tenant provisioning failed:', error)
  process.exit(1)
})
```

- [ ] **Step 11: Add the new env vars to `.env.example`**

```
# iam SSO client credentials, used to register a per-tenant iam app during
# provisioning (see web/iam/docs/user-guides and lib/nuxt-iam-client's README)
NUXT_IAM_URL=
NUXT_IAM_CLIENT_ID=
NUXT_IAM_CLIENT_API_SECRET=
# 64-character hex string (32 bytes) - generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NUXT_TENANT_SECRET_ENCRYPTION_KEY=
```

- [ ] **Step 12: Commit**

```bash
git add server/utils/tenantSecretCrypto.ts server/utils/tenantSecretCrypto.test.ts \
        server/utils/tenantIamConfig.ts server/utils/tenantIamConfig.test.ts \
        server/utils/tenantIamRegistration.ts server/db/scripts/provision-tenant.ts .env.example
git commit -m "feat: add tenant provisioning script with per-tenant iam app registration"
```

---

### Task 7: `nuxt-iam-client` module + dynamic credential resolution

**Files:**
- Modify: `package.json` (add `nuxt-iam-client` dependency)
- Modify: `nuxt.config.ts` (mount the module)
- Create: `server/utils/resolveTenantIam.ts`

- [ ] **Step 1: Add the dependency**

```json
"nuxt-iam-client": "file:../lib/nuxt-iam-client"
```

Run: `npm install`

- [ ] **Step 2: Create `server/utils/resolveTenantIam.ts`** — the exact contract `nuxt-iam-client`'s dynamic mode requires: a `resolveIamAppCredentials(event)` server util, auto-imported, named exactly this

```ts
import type { H3Event } from 'h3'
import { withTenantDb } from '../db/client'
import { getTenantIamAppConfig } from './tenantIamConfig'

export async function resolveIamAppCredentials(event: H3Event) {
  const tenant = event.context.tenant as { schemaName: string } | undefined
  if (!tenant) return null

  const config = await withTenantDb(tenant.schemaName, (db) => getTenantIamAppConfig(db, 'simple-ai-os'))
  if (!config) return null

  return {
    url: process.env.NUXT_IAM_URL || '',
    appId: config.appId,
    clientSecret: config.clientSecret,
  }
}
```

- [ ] **Step 3: Mount the module in `nuxt.config.ts`** — add `'nuxt-iam-client'` config to the `modules` array:

```ts
  modules: [
    '@nuxt/a11y',
    '@nuxt/eslint',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxt/test-utils',
    '@nuxtjs/i18n',
    '@nuxtjs/mdc',
    ['nuxt-iam-client', {
      instanceId: 'tenant',
      dynamic: true,
      routePrefix: '/api/auth/iam',
      composableAlias: 'useTenantAuth',
      authenticatedPath: '/authenticated',
      afterLoginPath: '/chat',
      notAuthenticatedPath: '/not-authenticated',
      afterLogoutPath: '/',
    }],
  ],
```

- [ ] **Step 4: Verify the module wires up cleanly**

Run: `npm run dev` (Ctrl+C once it boots without error), or `npx nuxt prepare`
Expected: no module-resolution or config errors; `.nuxt/types` gets `useTenantAuth` in its
auto-import types.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json nuxt.config.ts server/utils/resolveTenantIam.ts
git commit -m "feat: mount nuxt-iam-client in dynamic per-tenant mode"
```

---

### Task 8: App-level session endpoint + auth guard

**Files:**
- Create: `server/api/auth/session.get.ts`
- Create: `server/utils/requireTenantSession.ts`
- Test: `server/utils/requireTenantSession.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/utils/requireTenantSession.test.ts
import { describe, expect, it, vi } from 'vitest'

const getIamSessionMock = vi.fn()
vi.stubGlobal('getIamSession', getIamSessionMock)

const selectResult = vi.fn()
vi.mock('../db/client', () => ({
  withTenantDb: async (_schema: string, fn: (db: unknown) => unknown) =>
    fn({ select: () => ({ from: () => ({ where: () => ({ limit: selectResult }) }) }) }),
}))

import { requireTenantSession } from './requireTenantSession'

describe('requireTenantSession', () => {
  it('throws 404 when no tenant was resolved', async () => {
    const event = { context: { tenant: null } } as any
    await expect(requireTenantSession(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws 401 when there is no iam session', async () => {
    getIamSessionMock.mockResolvedValue(null)
    const event = { context: { tenant: { schemaName: 'tenant_acme' } } } as any
    await expect(requireTenantSession(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 when the iam session has no matching tenant user', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    selectResult.mockResolvedValue([])
    const event = { context: { tenant: { schemaName: 'tenant_acme' } } } as any
    await expect(requireTenantSession(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('returns tenant + user when authenticated and a member', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    selectResult.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const event = { context: { tenant: { schemaName: 'tenant_acme' } } } as any
    const result = await requireTenantSession(event)
    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/utils/requireTenantSession.test.ts`
Expected: FAIL — `Cannot find module './requireTenantSession'`

- [ ] **Step 3: Create `server/utils/requireTenantSession.ts`** — auto-creates the `users` row on first login (role `member`), matching spec decision 7: this app's provisioning script (unlike `home`'s) doesn't seed an owner, so the tenant's owner is whoever completes SSO login first

```ts
import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { withTenantDb } from '../db/client'
import { users, type TenantUser } from '../db/schema/tenant'
import type { TenantContext } from './tenant'

export interface TenantSession {
  tenant: TenantContext
  user: TenantUser
}

export async function requireTenantSession(event: H3Event): Promise<TenantSession> {
  const tenant = event.context.tenant as TenantContext | null
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown tenant' })
  }

  const session = await getIamSession(event, 'tenant')
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const user = await withTenantDb(tenant.schemaName, async (db) => {
    const [existing] = await db.select().from(users).where(eq(users.iamSub, session.username)).limit(1)
    if (existing) return existing

    const [created] = await db
      .insert(users)
      .values({ iamSub: session.username, email: session.email, role: 'member' })
      .returning()
    return created
  })

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  return { tenant, user }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/utils/requireTenantSession.test.ts`
Expected: PASS

- [ ] **Step 5: Create `server/api/auth/session.get.ts`** (the app-level session check the frontend's `useAuth()` composable calls — thin wrapper that turns a thrown 401/404 into `{ authenticated: false }` instead of an error response, since "not logged in" is a normal state for this endpoint, not a failure)

```ts
import { requireTenantSession } from '../../utils/requireTenantSession'

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireTenantSession(event)
    return { authenticated: true, user: { id: user.id, email: user.email, role: user.role } }
  } catch {
    return { authenticated: false, user: null }
  }
})
```

- [ ] **Step 6: Commit**

```bash
git add server/utils/requireTenantSession.ts server/utils/requireTenantSession.test.ts server/api/auth/session.get.ts
git commit -m "feat: add tenant session guard and app-level session endpoint"
```

---

### Task 9: Delete stub auth

**Files:**
- Delete: `server/lib/session.ts`
- Delete: `server/api/login.ts`
- Delete: `server/api/new-thread.ts`

- [ ] **Step 1: Delete the files**

```bash
git rm server/lib/session.ts server/api/login.ts server/api/new-thread.ts
```

- [ ] **Step 2: Grep for remaining references** (should only be `agent.post.ts`/`agent-stream.post.ts`, fixed in Task 10)

Run: `grep -rn "lib/session\|initSession" server/`

- [ ] **Step 3: Commit** (deferred — this commit is folded into Task 10's commit, since Task 10 is what removes the last two callers; leaving the repo in a non-building state between these two tasks is undesirable). Skip committing here; proceed directly to Task 10.

---

### Task 10: Wire auth + tenant db into chat and prompts

**Files:**
- Modify: `server/lib/prompts.ts` (every exported function takes `db` first)
- Modify: `server/api/prompts/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].put.ts`, `[id].delete.ts`, `[id]/history.get.ts`
- Modify: `server/lib/agent.ts`, `server/lib/agent-streaming.ts` (`chat(db, sessionId, ...)`)
- Modify: `server/api/agent.post.ts`, `server/api/agent-stream.post.ts`
- Modify: `server/mcp/server.ts` (`createMcpServer(db)`), `server/routes/mcp.post.ts`
- Test: `server/lib/prompts.test.ts` (new — none exists today for this file; add one covering the DI change)

- [ ] **Step 1: Write the failing test for the DI signature change**

```ts
// server/lib/prompts.test.ts
import { describe, expect, it, vi } from 'vitest'
import { listPrompts } from './prompts'

describe('listPrompts', () => {
  it('queries against the db instance it is given, not a module-level import', async () => {
    const rows = [{ id: '1', name: 'a', createdAt: new Date() }]
    const db = {
      select: () => ({
        from: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: async () => rows,
            }),
          }),
        }),
      }),
    } as any

    const result = await listPrompts(db, {})
    expect(result.prompts).toEqual(rows)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/lib/prompts.test.ts`
Expected: FAIL — `listPrompts` currently takes one argument, not two (TypeScript error) / uses the module-level `db`

- [ ] **Step 3: Rewrite `server/lib/prompts.ts`** — thread a `db: ReturnType<typeof import('drizzle-orm/node-postgres').drizzle>` parameter through every function, remove the `import { db } from '../db/client'` line, and import tables from `../db/schema/tenant` instead of `../db/schema`:

```ts
import { asc, desc, eq, sql } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { z } from 'zod'
import { promptHistory, prompts, type Prompt, type PromptHistoryEntry } from '../db/schema/tenant'

type Db = ReturnType<typeof drizzle>

export const createPromptSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  content: z.string().trim().min(1, 'content is required'),
  description: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  variables: z.array(z.string().trim().min(1)).optional(),
})

export type CreatePromptInput = z.infer<typeof createPromptSchema>

export const updatePromptSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    variables: z.array(z.string().trim().min(1)).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'at least one field must be provided',
  })

export type UpdatePromptInput = z.infer<typeof updatePromptSchema>

export const listPromptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  tag: z.string().trim().min(1).optional(),
})

export type ListPromptsQuery = z.infer<typeof listPromptsQuerySchema>

export async function listPrompts(
  db: Db,
  rawQuery: unknown,
): Promise<{ prompts: Prompt[]; limit: number; offset: number }> {
  const { limit, offset, tag } = listPromptsQuerySchema.parse(rawQuery)

  const rows = tag
    ? await db
        .select()
        .from(prompts)
        .where(sql`${prompts.tags} @> ARRAY[${tag}]::text[]`)
        .orderBy(desc(prompts.createdAt))
        .limit(limit)
        .offset(offset)
    : await db.select().from(prompts).orderBy(desc(prompts.createdAt)).limit(limit).offset(offset)

  return { prompts: rows, limit, offset }
}

export async function createPrompt(db: Db, rawInput: unknown): Promise<Prompt> {
  const input = createPromptSchema.parse(rawInput)

  const [row] = await db
    .insert(prompts)
    .values({
      name: input.name,
      content: input.content,
      description: input.description,
      tags: input.tags ?? [],
      variables: input.variables ?? [],
    })
    .returning()

  return row
}

export async function getPrompt(db: Db, id: string): Promise<Prompt | null> {
  const [row] = await db.select().from(prompts).where(eq(prompts.id, id))
  return row ?? null
}

function historySnapshot(current: Prompt, action: 'updated' | 'deleted') {
  return {
    promptId: current.id,
    name: current.name,
    content: current.content,
    description: current.description,
    tags: current.tags,
    variables: current.variables,
    version: current.version,
    score: current.score,
    action,
    promptCreatedAt: current.createdAt,
    promptUpdatedAt: current.updatedAt,
  }
}

export async function updatePrompt(db: Db, id: string, rawInput: unknown): Promise<Prompt | null> {
  const input = updatePromptSchema.parse(rawInput)

  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(prompts).where(eq(prompts.id, id))
    if (!current) return null

    await tx.insert(promptHistory).values(historySnapshot(current, 'updated'))

    const [row] = await tx
      .update(prompts)
      .set({ ...input, version: sql`${prompts.version} + 1`, updatedAt: sql`now()` })
      .where(eq(prompts.id, id))
      .returning()

    return row ?? null
  })
}

function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const code = (err as { code?: string }).code
  if (code) return code
  return pgErrorCode((err as { cause?: unknown }).cause)
}

export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23505'
}

export async function deletePrompt(db: Db, id: string): Promise<Prompt | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.delete(prompts).where(eq(prompts.id, id)).returning()
    if (!row) return null

    await tx.insert(promptHistory).values(historySnapshot(row, 'deleted'))

    return row
  })
}

export async function listPromptHistory(db: Db, promptId: string): Promise<PromptHistoryEntry[]> {
  return db
    .select()
    .from(promptHistory)
    .where(eq(promptHistory.promptId, promptId))
    .orderBy(asc(promptHistory.version))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/lib/prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Update every `server/api/prompts/**` handler to resolve the tenant db and require a session.** Example for `index.get.ts` (repeat the `requireTenantSession` + `withTenantDb` pattern for `index.post.ts`, `[id].get.ts`, `[id].put.ts`, `[id].delete.ts`, `[id]/history.get.ts`, swapping in the matching `prompts.ts` function and passing through the route's own params/body):

```ts
// server/api/prompts/index.get.ts
import { ZodError } from 'zod'
import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { listPrompts } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantSession(event)
  const query = getQuery(event)
  try {
    return await withTenantDb(tenant.schemaName, (db) => listPrompts(db, query))
  } catch (err) {
    if (err instanceof ZodError) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid query parameters', data: err.issues })
    }
    throw err
  }
})
```

```ts
// server/api/prompts/index.post.ts
import { ZodError } from 'zod'
import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { createPrompt, isUniqueViolation } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantSession(event)
  const body = await readBody(event)
  try {
    const prompt = await withTenantDb(tenant.schemaName, (db) => createPrompt(db, body))
    setResponseStatus(event, 201)
    return prompt
  } catch (err) {
    if (err instanceof ZodError) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid prompt body', data: err.issues })
    }
    if (isUniqueViolation(err)) {
      throw createError({ statusCode: 409, statusMessage: 'A prompt with this name already exists' })
    }
    throw err
  }
})
```

For `[id].get.ts`, `[id].put.ts`, `[id].delete.ts`, `[id]/history.get.ts`: read the existing handler, keep its `getRouterParam(event, 'id')`/body-parsing/error-mapping logic exactly as-is, and apply the same two changes each time — call `const { tenant } = await requireTenantSession(event)` first, then wrap the existing `prompts.ts` call in `withTenantDb(tenant.schemaName, (db) => existingCall(db, ...args))`.

- [ ] **Step 6: Update `server/lib/agent.ts`** to accept a `db` and thread it to prompt resolution (needed because MCP prompt lookup now goes through tenant-scoped `prompts`):

```ts
import { Anthropic } from "@anthropic-ai/sdk";
import { ContentBlock } from "@anthropic-ai/sdk/resources";
import type { drizzle } from "drizzle-orm/node-postgres";
import { agents, getAgent } from './agents';

const systemAgent = getAgent(agents, 'orchestrator');

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"]
});

type Message = {
        role: "user" | "assistant" | "system";
        content: string| ContentBlock[]
    };

function addUserMessage(messages: Message[], content: string) {
    messages.push({ role: "user", content });
}

function addAssistantMessage(messages: Message[], content: string| ContentBlock[]) {
    messages.push({ role: "assistant", content });
}

export async function chat(_db: ReturnType<typeof drizzle>, sessionId: string, userMessage: string): Promise<string> {
    const storage = useStorage('session');

    const sessionData = await storage.getItem(sessionId) as { messages: Message[]; claudeResponse: Anthropic.Message[] } || { messages: [] as Message[], claudeResponse: [] as Anthropic.Message[] };
    const { messages, claudeResponse = [] } = sessionData;

    addUserMessage(messages, userMessage);

    const responseMessage = await client.messages.create({
        max_tokens: 10000,
        messages: messages,
        model: "claude-sonnet-5",
        system: systemAgent.systemPrompt
    });
    const { content } = responseMessage;
    claudeResponse.push(responseMessage);

    addAssistantMessage(messages, content);

    sessionData.messages = messages;
    sessionData.claudeResponse = claudeResponse;
    await storage.setItem(sessionId, sessionData);

    return responseMessage.content.map(block => block.type === "text" ? block.text : '').join('\n');
}
```

(`_db` is currently unused by the non-streaming path — it doesn't resolve MCP prompts — but the parameter is added now for signature parity with `agent-streaming.ts` and so call sites don't need to change again when/if this path also gains prompt-picker support.)

- [ ] **Step 7: Update `server/mcp/server.ts`** to take a `db`:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { z } from 'zod'
import { listPrompts } from '../lib/prompts'
import { interpolate } from '../lib/mcp-prompts'

export async function createMcpServer(db: ReturnType<typeof drizzle>) {
  const server = new McpServer({ name: 'simple-ai-os-prompts', version: '1.0.0' })

  const { prompts: rows } = await listPrompts(db, { limit: 100 })

  for (const row of rows) {
    const argsSchema = Object.fromEntries(row.variables.map((name) => [name, z.string().optional()]))

    server.registerPrompt(
      row.name,
      { description: row.description ?? undefined, argsSchema },
      async (args) => ({
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: interpolate(row.content, args as Record<string, string | undefined>),
            },
          },
        ],
      }),
    )
  }

  return server
}
```

- [ ] **Step 8: Update `server/lib/agent-streaming.ts`** — `chat(db, sessionId, request)`, `resolvePromptText` takes `db` and passes it to `createMcpServer`:

```ts
import { Anthropic } from "@anthropic-ai/sdk";
import { ContentBlock } from "@anthropic-ai/sdk/resources";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { drizzle } from "drizzle-orm/node-postgres";
import { createMcpServer } from "../mcp/server";
import { type ChatRequest } from "../../shared/types/chat";
import { agents, getAgent } from './agents';

const systemAgent = getAgent(agents, 'orchestrator');

const client = new Anthropic({
    baseURL: process.env['AGENT_BASE_URL'],
    apiKey: process.env["ANTHROPIC_API_KEY"]
});

type Message = {
        role: "user" | "assistant" | "system";
        content: string| ContentBlock[]
    };

function addUserMessage(messages: Message[], content: string) {
    messages.push({ role: "user", content });
}

function addAssistantMessage(messages: Message[], content: string| ContentBlock[]) {
    messages.push({ role: "assistant", content });
}

async function resolvePromptText(db: ReturnType<typeof drizzle>, name: string, parameters?: Record<string, string>): Promise<string> {
    const server = await createMcpServer(db);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "agent-streaming", version: "1.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.getPrompt({ name, arguments: parameters });
    const [firstMessage] = result.messages;
    if (!firstMessage) {
        throw new Error(`Prompt "${name}" returned no messages`);
    }
    const text = (firstMessage.content as { type: "text"; text: string }).text;

    await client.close();
    await server.close();

    return text;
}

export function chat(db: ReturnType<typeof drizzle>, sessionId: string, request: ChatRequest): ReadableStream<string> {
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            let content = '';

            const storage = useStorage('session');

            const sessionData = await storage.getItem(sessionId) as { messages: Message[]; claudeResponse: Anthropic.Message[] } || { messages: [] as Message[], claudeResponse: [] as Anthropic.Message[] };
            const { messages, claudeResponse = [] } = sessionData;

            const userMessageText = request.type === "text"
                ? request.text
                : await resolvePromptText(db, request.name, request.parameters);

            addUserMessage(messages, userMessageText);

            const claudeStream = await client.messages.create({
                max_tokens: 10000,
                messages: messages,
                model: "claude-sonnet-5",
                system: systemAgent.systemPrompt,
                stream: true,
            });
            for await (const messageStreamEvent of claudeStream) {
                if (messageStreamEvent.type === "content_block_delta") {
                    if (messageStreamEvent.delta.type === "text_delta") {
                        const textChunk = messageStreamEvent.delta.text;
                        content += textChunk;
                        controller.enqueue(encoder.encode(textChunk));
                    }
                }
            }

            addAssistantMessage(messages, content);

            sessionData.messages = messages;
            sessionData.claudeResponse = claudeResponse;
            await storage.setItem(sessionId, sessionData);

            controller.close();
        }
    });
    return stream;
}
```

(Dropped the debug `console.log` calls while touching this file — they were left over from initial scaffolding and aren't needed now that this path is exercised by tests and real auth.)

- [ ] **Step 9: Update `server/api/agent.post.ts`** — replaces the deleted `initSession` stub with `requireTenantSession`, keeps the `session_id` cookie purely for fs conversation continuity (unrelated to auth):

```ts
import { withTenantDb } from '../db/client'
import { requireTenantSession } from '../utils/requireTenantSession'
import { chat } from '../lib/agent'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { tenant } = await requireTenantSession(event)

    const sessionId = getCookie(event, 'session_id') || crypto.randomUUID()
    setCookie(event, 'session_id', sessionId, { httpOnly: true })

    const response = await withTenantDb(tenant.schemaName, (db) => chat(db, sessionId, body.value))

    return response
})
```

- [ ] **Step 10: Update `server/api/agent-stream.post.ts`** the same way:

```ts
import { withTenantDb } from '../db/client'
import { requireTenantSession } from '../utils/requireTenantSession'
import { chat } from '../lib/agent-streaming'
import { chatRequestSchema } from '../../shared/types/chat'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const request = chatRequestSchema.parse(body)
    const { tenant } = await requireTenantSession(event)

    const sessionId = getCookie(event, 'session_id') || crypto.randomUUID()
    setCookie(event, 'session_id', sessionId, { httpOnly: true })

    const stream = await withTenantDb(tenant.schemaName, (db) => Promise.resolve(chat(db, sessionId, request)))

    return sendStream(event, stream)
})
```

- [ ] **Step 11: Update `server/routes/mcp.post.ts`** to resolve tenant + db (still no bearer auth — that's WP-5, deferred per the spec — but the prompts table has moved to the tenant schema, so a tenant must be resolvable):

```ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from '../mcp/server'
import { withTenantDb } from '../db/client'
import type { TenantContext } from '../utils/tenant'

export default defineEventHandler(async (event) => {
  const tenant = event.context.tenant as TenantContext | null
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown tenant' })
  }

  const body = await readBody(event)
  const server = await withTenantDb(tenant.schemaName, (db) => createMcpServer(db))
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  event.node.res.on('close', () => {
    transport.close()
    server.close()
  })

  await server.connect(transport)
  await transport.handleRequest(event.node.req, event.node.res, body)
})
```

- [ ] **Step 12: Update existing tests that reference the old signatures.** Run the full suite and fix any now-broken call sites:

Run: `npx vitest run`
Expected: failures only in tests that call `chat(sessionId, ...)`, `createMcpServer()`, or the old
one-argument `prompts.ts` functions directly — update each call site to pass a `db` (a plain
object stub is fine for tests that don't exercise DB calls, matching the pattern already used in
`server/utils/requireTenantSession.test.ts`).

- [ ] **Step 13: Run the full suite to verify everything passes**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add server/lib/prompts.ts server/lib/prompts.test.ts server/api/prompts \
        server/lib/agent.ts server/lib/agent-streaming.ts \
        server/api/agent.post.ts server/api/agent-stream.post.ts \
        server/mcp/server.ts server/routes/mcp.post.ts \
        server/lib/agents.test.ts server/lib/prompt-improver.test.ts server/lib/mcp-prompts.test.ts
git commit -m "feat: require tenant auth and thread tenant db through chat, prompts, and mcp"
```

---

### Task 11: Frontend login flow

**Files:**
- Create: `app/pages/login.vue`
- Create: `app/pages/authenticated.vue`
- Create: `app/pages/not-authenticated.vue`
- Create: `app/composables/useAuth.ts`
- Create: `app/middleware/auth.ts`
- Modify: `app/pages/chat.vue`, `app/pages/chat-streaming.vue` (add `middleware: 'auth'`)

- [ ] **Step 1: Create `app/composables/useAuth.ts`** (app-level composable, wraps the app's own `/api/auth/session` — distinct from the module-provided `useTenantAuth()`, which only knows about the raw `iam` session, not tenant membership)

```ts
interface SessionResponse {
  authenticated: boolean
  user: { id: string; email: string; role: 'member' | 'admin' } | null
}

export function useAuth() {
  const isAuthenticated = useState<boolean>('tenant-authenticated', () => false)
  const user = useState<SessionResponse['user']>('tenant-user', () => null)
  const requestFetch = useRequestFetch()

  async function refresh() {
    const data = await requestFetch<SessionResponse>('/api/auth/session')
    isAuthenticated.value = data.authenticated
    user.value = data.user
  }

  return {
    isAuthenticated,
    user,
    refresh,
    logout: async () => {
      await $fetch('/api/auth/iam/logout', { method: 'POST' })
      isAuthenticated.value = false
      user.value = null
      await navigateTo('/')
    },
  }
}
```

- [ ] **Step 2: Create `app/middleware/auth.ts`**

```ts
export default defineNuxtRouteMiddleware(async (to) => {
  const { isAuthenticated, refresh } = useAuth()
  await refresh()

  if (!isAuthenticated.value) {
    return navigateTo('/login', { query: { redirect: to.fullPath } })
  }
})
```

- [ ] **Step 3: Create `app/pages/login.vue`**

```vue
<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'simple-ai-os - Log In' })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="w-full max-w-md rounded-xl p-8 text-center">
      <h1 class="mb-2 text-2xl font-semibold">Log In</h1>
      <p class="mb-8 text-gray-500">Sign in with your tryyourideas ID to continue.</p>
      <a href="/api/auth/iam/login" class="inline-block w-full rounded-lg bg-primary px-6 py-3 text-white hover:opacity-90">
        Log in with tryyourideas ID
      </a>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Create `app/pages/authenticated.vue`**

```vue
<script setup lang="ts">
definePageMeta({ layout: false })

const { refresh, isAuthenticated } = useAuth()
await refresh()

if (isAuthenticated.value) {
  await navigateTo('/chat')
} else {
  await navigateTo('/not-authenticated')
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <p>Signing in…</p>
  </div>
</template>
```

- [ ] **Step 5: Create `app/pages/not-authenticated.vue`**

```vue
<script setup lang="ts">
definePageMeta({ layout: false })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="text-center">
      <h1 class="mb-2 text-2xl font-semibold">Not signed in</h1>
      <p class="mb-8 text-gray-500">We couldn't sign you in. Please try again.</p>
      <a href="/login" class="text-primary underline">Back to login</a>
    </div>
  </div>
</template>
```

- [ ] **Step 6: Add `middleware: 'auth'` to `app/pages/chat.vue` and `app/pages/chat-streaming.vue`** — in each file's `<script setup>` block, add (or extend an existing `definePageMeta` call with):

```ts
definePageMeta({ middleware: 'auth' })
```

- [ ] **Step 7: Manual verification** (no automated UI test in this task — Task 12 covers Playwright)

Run: `npm run dev`, visit `http://acme.localhost:3000/chat` (after provisioning a local `acme`
tenant per Task 6's script and registering it with a locally running `iam`) — expect a redirect
to `/login`, and after completing the `iam` passwordless flow, a redirect back to `/chat` with
the page rendering normally.

- [ ] **Step 8: Commit**

```bash
git add app/composables/useAuth.ts app/middleware/auth.ts app/pages/login.vue app/pages/authenticated.vue app/pages/not-authenticated.vue app/pages/chat.vue app/pages/chat-streaming.vue
git commit -m "feat: add SSO login flow and auth-gated chat pages"
```

---

### Task 12: e2e-api tenant isolation test + Playwright SSO test

**Files:**
- Create: `test/helpers/db.ts`
- Create: `test/e2e-api/tenant-isolation.test.ts`
- Create: `tests/e2e/login.spec.ts`
- Modify: `vitest.config.ts` (or add `vitest.e2e-api.config.ts` if isolation from the unit config is needed — mirror `home`'s split)

- [ ] **Step 1: Create `vitest.e2e-api.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/e2e-api/**/*.test.ts'],
    testTimeout: 20000,
  },
})
```

- [ ] **Step 2: Create `test/helpers/db.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { tenants } from '../../server/db/schema/public'

function getConnectionString(): string {
  return process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/simple-ai-os'
}

export async function ensureTestTenant(slug: string, name: string): Promise<string> {
  const schemaName = `tenant_${slug}`
  const pool = new Pool({ connectionString: getConnectionString(), max: 1 })
  const db = drizzle(pool)

  await db.insert(tenants).values({ slug, schemaName, companyName: name }).onConflictDoNothing()
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
  await pool.end()

  const tenantPool = new Pool({ connectionString: getConnectionString(), max: 1, options: `-c search_path=${schemaName},public` })
  await migrate(drizzle(tenantPool), { migrationsFolder: './server/db/migrations/tenant', migrationsSchema: schemaName })
  await tenantPool.end()

  return schemaName
}

export function getTestTenantDb(schemaName: string) {
  const pool = new Pool({ connectionString: getConnectionString(), options: `-c search_path=${schemaName},public` })
  return drizzle(pool)
}
```

- [ ] **Step 3: Write `test/e2e-api/tenant-isolation.test.ts`** — proves the schema-per-tenant isolation guarantee end to end against a real Postgres

```ts
import { describe, expect, it, beforeAll } from 'vitest'
import { ensureTestTenant, getTestTenantDb } from '../helpers/db'
import { createPrompt, listPrompts } from '../../server/lib/prompts'

describe('tenant isolation', () => {
  let dbA: ReturnType<typeof getTestTenantDb>
  let dbB: ReturnType<typeof getTestTenantDb>

  beforeAll(async () => {
    const schemaA = await ensureTestTenant('e2e-tenant-a', 'Tenant A')
    const schemaB = await ensureTestTenant('e2e-tenant-b', 'Tenant B')
    dbA = getTestTenantDb(schemaA)
    dbB = getTestTenantDb(schemaB)
  })

  it('lets two tenants use the same prompt name with no collision', async () => {
    await createPrompt(dbA, { name: 'shared-name', content: 'from A' })
    await createPrompt(dbB, { name: 'shared-name', content: 'from B' })

    const { prompts: promptsA } = await listPrompts(dbA, {})
    const { prompts: promptsB } = await listPrompts(dbB, {})

    expect(promptsA.map((p) => p.content)).toContain('from A')
    expect(promptsA.map((p) => p.content)).not.toContain('from B')
    expect(promptsB.map((p) => p.content)).toContain('from B')
    expect(promptsB.map((p) => p.content)).not.toContain('from A')
  })
})
```

- [ ] **Step 4: Add the e2e-api script to `package.json`**

```json
"test:e2e-api": "vitest run --config vitest.e2e-api.config.ts"
```

- [ ] **Step 5: Run it against a local Postgres**

Run: `docker compose up -d postgres && DATABASE_URL=postgres://postgres:postgres@localhost:5433/simple-ai-os npm run test:e2e-api`
Expected: PASS

- [ ] **Step 6: Write `tests/e2e/login.spec.ts`** — mirrors `home`'s `e2e/login.spec.ts` pattern: navigate to a real `*.localhost` hostname rather than spoofing the `Host` header (both `fetch`/undici and real browsers refuse to let client code set it — see `home`'s learnings doc)

```ts
import { test, expect } from '@playwright/test'

test('redirects an unauthenticated visitor from /chat to /login', async ({ page, baseURL }) => {
  const url = new URL(baseURL!)
  url.hostname = `e2e-test.${url.hostname}`
  await page.goto(`${url.origin}/chat`)
  await expect(page).toHaveURL(/\/login/)
})
```

This test requires an `e2e-test` tenant to already exist (via `ensureTestTenant`, run in a
Playwright global setup) — wire that up the same way `home`'s
`tests/playwright/global-setup.ts` does, once a local `iam` instance is available in this app's
Playwright config for the full login round-trip. Leave the full authenticated round-trip (through
a real local `iam`) as a follow-up once CI has an `iam` instance available — this step covers the
redirect-when-unauthenticated half, which needs no `iam` dependency.

- [ ] **Step 7: Commit**

```bash
git add vitest.e2e-api.config.ts test/helpers/db.ts test/e2e-api/tenant-isolation.test.ts tests/e2e/login.spec.ts package.json
git commit -m "test: add tenant isolation e2e-api test and login redirect e2e test"
```

---

### Task 13: Documentation

**Files:**
- Modify: `docs/architecture/ADR/0004-multitenancy-schema-per-tenant.md` (Status → Accepted)
- Modify: `docs/architecture/ADR/0005-sso-via-nuxt-iam-client.md` (Status → Accepted)
- Modify: `docs/changes.md`
- Modify: `docs/user-guides/config.md`, `docs/user-guides/manual.md`, `docs/user-guides/features.md`

- [ ] **Step 1: Update both ADRs' `## Status` line**

```markdown
## Status

Accepted — implemented per `docs/superpowers/plans/2026-08-19-multitenancy-sso.md`
```

- [ ] **Step 2: Append an entry to `docs/changes.md`** summarizing: schema-per-tenant multitenancy, `nuxt-iam-client` SSO in dynamic per-tenant mode, `prompts`/`prompt_history` moved into tenant schemas, `/api/login` and the stub session deleted, chat/prompts/MCP now require an authenticated tenant session.

- [ ] **Step 3: Update `docs/user-guides/config.md`** with the new env vars (`NUXT_IAM_URL`, `NUXT_IAM_CLIENT_ID`, `NUXT_IAM_CLIENT_API_SECRET`, `NUXT_TENANT_SECRET_ENCRYPTION_KEY`) and the `db:provision-tenant` script usage.

- [ ] **Step 4: Update `docs/user-guides/manual.md`** with a short "logging in" section (link with your tryyourideas ID, redirect flow) and a sequence diagram (reuse the mermaid diagram from `docs/superpowers/specs/2026-08-19-multitenancy-sso-design.md`).

- [ ] **Step 5: Update `docs/user-guides/features.md`** adding "Multitenancy" and "SSO login via iam" to the feature list.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/ADR/0004-multitenancy-schema-per-tenant.md docs/architecture/ADR/0005-sso-via-nuxt-iam-client.md docs/changes.md docs/user-guides/config.md docs/user-guides/manual.md docs/user-guides/features.md
git commit -m "docs: record multitenancy + SSO as implemented"
```

---

## Self-review notes

- **Spec coverage**: all 9 numbered decisions in the design spec map to a task — schema-per-tenant (Tasks 1, 4), tenant resolution (Task 3), tenant-scoped DB access (Task 2), provisioning (Task 6), SSO (Tasks 7, 8, 11), per-tenant iam app registration (Task 6), tenant membership on first login (Task 8), domain convention (Task 6 Step 9), removed endpoints (Task 9).
- **Deferred scope respected**: no task touches `threads`/`messages` (WP-3), retention/backup/Redis session persistence (WP-4), or bearer-token MCP auth (WP-5) — `server/routes/mcp.post.ts` in Task 10 only adds tenant resolution, explicitly not auth.
- **Type consistency checked**: `chat(db, sessionId, ...)` signature is consistent between `agent.ts`, `agent-streaming.ts`, and both call sites in Task 10; `createMcpServer(db)` consistent between `server/mcp/server.ts`, `agent-streaming.ts`'s `resolvePromptText`, and `server/routes/mcp.post.ts`; every `prompts.ts` export takes `db` as its first parameter, matched by every caller in `server/api/prompts/**`.
- **Phase 2 explicitly out of scope**: this plan does not touch `web/home` at all — the cross-app auto-provisioning trigger is a separate future plan, as agreed.
