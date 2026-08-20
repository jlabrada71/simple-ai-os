# Cross-App Tenant Auto-Provisioning (home → simple-ai-os) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an operator provisions a tenant in `web/home`'s admin, automatically provision
the matching tenant in `web/simple-ai-os` too — no separate manual step.

**Architecture:** `simple-ai-os` gets an idempotent, reusable `provisionTenant()` function
(shared by its CLI script and a new bearer-key-protected `POST /api/admin/tenants` endpoint).
`home`'s existing tenant-provisioning endpoint calls that new endpoint synchronously, right
after its own `iam`-registration step, and does not fail the whole request if that call fails
(matching how it already treats `iam`-registration failure). A backfill script in `home`
provides the retry path for tenants where it failed.

**Tech Stack:** Nuxt 4/Nitro, Drizzle ORM, Postgres 18, `fetch` (no new HTTP client
dependency), Vitest (`@nuxt/test-utils/e2e` for `home`'s real-server e2e-api tests).

**Spec:** `docs/superpowers/specs/2026-08-19-cross-app-tenant-provisioning-design.md`

**Repos touched:** `web/simple-ai-os` (Tasks 1–5) and `web/home` (Tasks 6–9). All file paths
below are relative to each task's repo root as labeled.

---

## File structure

| Repo | File | Responsibility |
|---|---|---|
| simple-ai-os | `server/lib/provisionTenant.ts` | idempotent provisioning logic, shared by CLI + HTTP (new) |
| simple-ai-os | `server/db/scripts/provision-tenant.ts` | CLI entry point, now calls the shared function (rewritten) |
| simple-ai-os | `server/utils/hash.ts` | `sha256Hex`/`hashMatches`, ported from `iam` (new) |
| simple-ai-os | `server/utils/adminApiAuth.ts` | `requireAdminApiKey(event)` guard, ported from `iam` (new) |
| simple-ai-os | `server/api/admin/tenants/index.post.ts` | new bearer-key-protected provisioning endpoint (new) |
| simple-ai-os | `.env.example` | add `NUXT_ADMIN_API_KEY` |
| home | `server/utils/simpleAiOsProvisioning.ts` | calls simple-ai-os's new endpoint (new) |
| home | `server/api/admin/tenants/index.post.ts` | one more non-fatal step after the `iam` registration step (modified) |
| home | `server/db/scripts/backfill-simple-ai-os-tenant.ts` | retry mechanism for tenants missing simple-ai-os provisioning (new) |
| home | `package.json` | add `db:backfill-simple-ai-os-tenant` script |
| home | `.env.example` | add `NUXT_SIMPLE_AI_OS_URL`, `NUXT_SIMPLE_AI_OS_ADMIN_API_KEY` |
| home | `test/e2e-api/admin-tenants-api.test.ts` | extend with a fake simple-ai-os server + new assertions (modified) |

---

## Task 1 (simple-ai-os): Extract idempotent `provisionTenant()`

**Files:**
- Create: `server/lib/provisionTenant.ts`
- Test: `server/lib/provisionTenant.test.ts`
- Modify: `server/db/scripts/provision-tenant.ts`

- [ ] **Step 1: Write the failing idempotency test**

```ts
// server/lib/provisionTenant.test.ts
import { describe, expect, it, vi } from 'vitest'

const { insertMock, selectLimitMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  selectLimitMock: vi.fn(),
}))

vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: vi.fn(() => ({})) }))
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}))
vi.mock('drizzle-orm/node-postgres/migrator', () => ({ migrate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./tenantIamRegistration', () => ({
  registerTenantIamApp: vi.fn().mockResolvedValue({
    appId: 'app-1',
    clientSecret: 'secret',
    authenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/authenticated',
    notAuthenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/not-authenticated',
  }),
}))
vi.mock('./tenantIamConfig', () => ({
  getTenantIamAppConfig: vi.fn().mockResolvedValue(null),
  storeTenantIamAppConfig: vi.fn().mockResolvedValue(undefined),
}))

describe('provisionTenant', () => {
  it('returns alreadyExisted: true without inserting again when the slug is already provisioned', async () => {
    // Simulate an existing row: db.select().from(tenants).where().limit() resolves non-empty.
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: '1', slug: 'acme', schemaName: 'tenant_acme', companyName: 'Acme' }] }) }) }),
      insert: insertMock,
    }
    const { drizzle } = await import('drizzle-orm/node-postgres')
    ;(drizzle as any).mockReturnValue(fakeDb)

    const { provisionTenant } = await import('./provisionTenant')
    const result = await provisionTenant({ slug: 'acme', name: 'Acme Co' })

    expect(result).toEqual({ schemaName: 'tenant_acme', alreadyExisted: true })
    expect(insertMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/lib/provisionTenant.test.ts`
Expected: FAIL — `Cannot find module './provisionTenant'`

- [ ] **Step 3: Create `server/lib/provisionTenant.ts`** — moves the body of the current
  `server/db/scripts/provision-tenant.ts` into a reusable function, adding the
  check-before-insert idempotency guard:

```ts
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { tenants } from '../db/schema/public'
import { registerTenantIamApp } from '../utils/tenantIamRegistration'
import { getTenantIamAppConfig, storeTenantIamAppConfig } from '../utils/tenantIamConfig'

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/simple-ai-os'

export interface ProvisionTenantInput {
  slug: string
  name: string
}

export interface ProvisionTenantResult {
  schemaName: string
  alreadyExisted: boolean
}

export async function provisionTenant({ slug, name }: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const schemaName = `tenant_${slug}`

  const pool = new Pool({ connectionString, max: 1 })
  const db = drizzle(pool)

  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
  if (existing) {
    await pool.end()
    return { schemaName: existing.schemaName, alreadyExisted: true }
  }

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
  }

  await tenantPool.end()

  return { schemaName, alreadyExisted: false }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/lib/provisionTenant.test.ts`
Expected: PASS

- [ ] **Step 5: Rewrite `server/db/scripts/provision-tenant.ts`** to call the shared function:

```ts
import { provisionTenant } from '../../lib/provisionTenant'

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
  const result = await provisionTenant({ slug, name })

  if (result.alreadyExisted) {
    console.log(`Tenant "${slug}" was already provisioned (schema "${result.schemaName}")`)
    return
  }

  console.log(`Tenant "${slug}" provisioned with schema "${result.schemaName}"`)
  console.log('No owner user was seeded - the first person to complete SSO login becomes the tenant owner (role: member; promote to admin manually - see docs/backlog.md).')
}

main().catch((error) => {
  console.error('Tenant provisioning failed:', error)
  process.exit(1)
})
```

- [ ] **Step 6: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS (all existing tests still pass; the CLI script itself has no direct test, matching its baseline)

- [ ] **Step 7: Commit**

```bash
git add server/lib/provisionTenant.ts server/lib/provisionTenant.test.ts server/db/scripts/provision-tenant.ts
git commit -m "refactor: extract idempotent provisionTenant() shared by CLI and future HTTP endpoint"
```

---

## Task 2 (simple-ai-os): Admin API key auth guard

**Files:**
- Create: `server/utils/hash.ts`
- Create: `server/utils/adminApiAuth.ts`
- Test: `server/utils/adminApiAuth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/utils/adminApiAuth.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import { createError } from 'h3'
import { requireAdminApiKey } from './adminApiAuth'

function eventWithHeader(value: string | undefined) {
  return { node: { req: { headers: { 'x-admin-api-key': value } } } } as any
}

describe('requireAdminApiKey', () => {
  beforeEach(() => {
    process.env.NUXT_ADMIN_API_KEY = 'correct-key'
  })

  it('throws 503 when the key is not configured', () => {
    delete process.env.NUXT_ADMIN_API_KEY
    expect(() => requireAdminApiKey(eventWithHeader('anything'))).toThrow()
  })

  it('throws 401 when no key is provided', () => {
    expect(() => requireAdminApiKey(eventWithHeader(undefined))).toThrow()
  })

  it('throws 401 when the wrong key is provided', () => {
    expect(() => requireAdminApiKey(eventWithHeader('wrong-key'))).toThrow()
  })

  it('does not throw when the correct key is provided', () => {
    expect(() => requireAdminApiKey(eventWithHeader('correct-key'))).not.toThrow()
  })
})
```

Note: `getHeader` from `h3` is a real function that reads `event.node.req.headers` directly, so
no mocking of `h3` is needed — only `createError` needs to be importable, which it is.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/utils/adminApiAuth.test.ts`
Expected: FAIL — `Cannot find module './adminApiAuth'`

- [ ] **Step 3: Create `server/utils/hash.ts`** (ported verbatim from `iam/server/utils/hash.ts`)

```ts
import { createHash, timingSafeEqual } from 'node:crypto'

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hashMatches(value: string, hash: string): boolean {
  const candidate = Buffer.from(sha256Hex(value), 'hex')
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) {
    return false
  }
  return timingSafeEqual(candidate, expected)
}
```

- [ ] **Step 4: Create `server/utils/adminApiAuth.ts`** (ported from `iam/server/utils/adminApiAuth.ts`, env var renamed to this app's convention)

```ts
import { createError, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { hashMatches, sha256Hex } from './hash'

export function requireAdminApiKey(event: H3Event): void {
  const configuredKey = process.env.NUXT_ADMIN_API_KEY
  if (!configuredKey) {
    throw createError({ statusCode: 503, statusMessage: 'Admin API key is not configured.' })
  }

  const providedKey = getHeader(event, 'x-admin-api-key')
  if (!providedKey || !hashMatches(providedKey, sha256Hex(configuredKey))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or missing admin API key.' })
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run server/utils/adminApiAuth.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/utils/hash.ts server/utils/adminApiAuth.ts server/utils/adminApiAuth.test.ts
git commit -m "feat: add admin API key auth guard for service-to-service calls"
```

---

## Task 3 (simple-ai-os): `POST /api/admin/tenants` endpoint

**Files:**
- Create: `server/api/admin/tenants/index.post.ts`
- Modify: `.env.example`

- [ ] **Step 1: Create the endpoint**

```ts
import { requireAdminApiKey } from '../../../utils/adminApiAuth'
import { provisionTenant } from '../../../lib/provisionTenant'

interface ProvisionRequestBody {
  slug?: string
  name?: string
}

const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export default defineEventHandler(async (event) => {
  requireAdminApiKey(event)

  const body = await readBody<ProvisionRequestBody>(event)
  const { slug, name } = body ?? {}

  if (!slug || !name) {
    throw createError({ statusCode: 400, statusMessage: 'slug and name are required' })
  }
  if (!SLUG_REGEX.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Slug must be lowercase letters, numbers, and hyphens only' })
  }

  const result = await provisionTenant({ slug, name })

  return { success: true, slug, schemaName: result.schemaName, alreadyExisted: result.alreadyExisted }
})
```

- [ ] **Step 2: Add `NUXT_ADMIN_API_KEY` to `.env.example`**

```
# Shared secret authenticating server-to-server admin calls (e.g. home's
# cross-app tenant provisioning). Generate with: openssl rand -hex 32
NUXT_ADMIN_API_KEY=
```

- [ ] **Step 3: Manual smoke test against a running dev server + local Postgres**

Run: `npm run dev` (with `DATABASE_URL` and `NUXT_ADMIN_API_KEY` set), then:
```bash
curl -X POST http://localhost:3000/api/admin/tenants \
  -H "x-admin-api-key: $NUXT_ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{"slug":"smoketest","name":"Smoke Test"}'
```
Expected: `{"success":true,"slug":"smoketest","schemaName":"tenant_smoketest","alreadyExisted":false}`.
Run the same command again — expected `alreadyExisted:true`, no error.

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/api/admin/tenants/index.post.ts .env.example
git commit -m "feat: add POST /api/admin/tenants for cross-app provisioning"
```

---

## Task 4 (simple-ai-os): Prune the now-implemented backlog item + ADR

**Files:**
- Modify: `docs/backlog.md`
- Create: `docs/architecture/ADR/0006-cross-app-tenant-provisioning-shared-key.md`
- Modify: `docs/changes.md`

- [ ] **Step 1: Remove the "Phase 2 — cross-app tenant auto-provisioning" section from `docs/backlog.md`** (it's implemented now — the remaining backlog items, WP-3/4/5 and the iam-token-verification/tenant-admin-UI items, are unaffected).

- [ ] **Step 2: Create the ADR**

```markdown
# ADR-0006: Cross-app tenant provisioning via a shared admin API key

## Status

Accepted

## Context

Phase 2 of the multitenancy work (see
`docs/superpowers/specs/2026-08-19-cross-app-tenant-provisioning-design.md`) needed `web/home`
to trigger tenant provisioning in `simple-ai-os` automatically. This is a backend-to-backend
call between two trusted services operated by the same team, not a user-facing surface.

## Decision

Authenticate the call with a static shared secret (`x-admin-api-key` header, SHA-256 +
`timingSafeEqual` comparison), reusing `web/iam`'s existing `requireAdminApiKey` pattern
verbatim rather than inventing a new scheme (`server/utils/hash.ts`,
`server/utils/adminApiAuth.ts`). The call is synchronous and non-fatal: `home`'s own tenant is
never rolled back if the `simple-ai-os` call fails, matching how `home` already treats its
`iam`-app-registration step. `simple-ai-os`'s provisioning function is idempotent (checks for
an existing tenant row before inserting), which is what makes both an inline retry and the new
`db:backfill-simple-ai-os-tenant` script in `home` safe to run repeatedly.

## Alternatives considered

- **OAuth/service-account tokens**: rejected as disproportionate for a same-workspace,
  operator-controlled backend-to-backend call — no external actor ever holds this credential.
- **Fire-and-forget (no response awaited)**: rejected — an admin provisioning a tenant should
  see immediately whether the whole tenant (across both apps) succeeded, not discover a partial
  failure later with no signal.

## Consequences

- **Positive:** one auth pattern (`requireAdminApiKey`) shared across `iam` and now
  `simple-ai-os`, both admin-API surfaces in this workspace.
- **Cost:** the shared secret must be kept in sync between `home`'s
  `NUXT_SIMPLE_AI_OS_ADMIN_API_KEY` and `simple-ai-os`'s `NUXT_ADMIN_API_KEY` per environment -
  a one-time manual step, same category as the existing `iam` app-registration secrets.
```

- [ ] **Step 3: Append an entry to `docs/changes.md`** summarizing this phase (extracted
  `provisionTenant()`, new `POST /api/admin/tenants`, new `NUXT_ADMIN_API_KEY`).

- [ ] **Step 4: Commit**

```bash
git add docs/backlog.md docs/architecture/ADR/0006-cross-app-tenant-provisioning-shared-key.md docs/changes.md
git commit -m "docs: record cross-app tenant provisioning decision, prune implemented backlog item"
```

---

## Task 5 (simple-ai-os): Final verification before switching repos

- [ ] **Step 1: Run the full suite one more time**

Run: `npx vitest run`
Expected: PASS, all files green.

- [ ] **Step 2: No commit needed** — this is a checkpoint before moving to `web/home`.

---

## Task 6 (home): `simpleAiOsProvisioning.ts` util

**Files:**
- Create: `server/utils/simpleAiOsProvisioning.ts`
- Test: `server/utils/simpleAiOsProvisioning.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

```ts
// server/utils/simpleAiOsProvisioning.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { provisionSimpleAiOsTenant } from './simpleAiOsProvisioning'

const originalFetch = global.fetch

describe('provisionSimpleAiOsTenant', () => {
  beforeEach(() => {
    process.env.NUXT_SIMPLE_AI_OS_URL = 'https://simple-ai-os.tryyourideas.com'
    process.env.NUXT_SIMPLE_AI_OS_ADMIN_API_KEY = 'test-key'
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('posts slug and name with the admin api key header, and returns the parsed result on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, slug: 'acme', schemaName: 'tenant_acme', alreadyExisted: false }),
    }) as any

    const result = await provisionSimpleAiOsTenant({ slug: 'acme', name: 'Acme Co' })

    expect(result).toEqual({ ok: true, schemaName: 'tenant_acme', alreadyExisted: false })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://simple-ai-os.tryyourideas.com/api/admin/tenants',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-admin-api-key': 'test-key' }),
        body: JSON.stringify({ slug: 'acme', name: 'Acme Co' }),
      }),
    )
  })

  it('returns ok: false instead of throwing when the response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as any

    const result = await provisionSimpleAiOsTenant({ slug: 'acme', name: 'Acme Co' })

    expect(result.ok).toBe(false)
  })

  it('returns ok: false instead of throwing when fetch itself rejects (network error)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any

    const result = await provisionSimpleAiOsTenant({ slug: 'acme', name: 'Acme Co' })

    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/utils/simpleAiOsProvisioning.test.ts`
Expected: FAIL — `Cannot find module './simpleAiOsProvisioning'`

- [ ] **Step 3: Create `server/utils/simpleAiOsProvisioning.ts`**

```ts
export interface ProvisionSimpleAiOsTenantResult {
  ok: boolean
  schemaName?: string
  alreadyExisted?: boolean
}

export async function provisionSimpleAiOsTenant({ slug, name }: { slug: string; name: string }): Promise<ProvisionSimpleAiOsTenantResult> {
  const baseUrl = (process.env.NUXT_SIMPLE_AI_OS_URL || '').replace(/\/+$/, '')
  const apiKey = process.env.NUXT_SIMPLE_AI_OS_ADMIN_API_KEY || ''

  try {
    const response = await fetch(`${baseUrl}/api/admin/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-api-key': apiKey,
      },
      body: JSON.stringify({ slug, name }),
    })

    if (!response.ok) {
      console.error(`simple-ai-os tenant provisioning failed with status ${response.status}: ${await response.text()}`)
      return { ok: false }
    }

    const data = (await response.json()) as { schemaName: string; alreadyExisted: boolean }
    return { ok: true, schemaName: data.schemaName, alreadyExisted: data.alreadyExisted }
  } catch (error) {
    console.error('simple-ai-os tenant provisioning request threw:', error)
    return { ok: false }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/utils/simpleAiOsProvisioning.test.ts`
Expected: PASS

- [ ] **Step 5: Add the new env vars to `.env.example`**

```
# simple-ai-os cross-app tenant provisioning (see
# simple-ai-os/docs/architecture/ADR/0006-cross-app-tenant-provisioning-shared-key.md).
# NUXT_SIMPLE_AI_OS_ADMIN_API_KEY must match simple-ai-os's own NUXT_ADMIN_API_KEY.
NUXT_SIMPLE_AI_OS_URL=
NUXT_SIMPLE_AI_OS_ADMIN_API_KEY=
```

- [ ] **Step 6: Commit**

```bash
git add server/utils/simpleAiOsProvisioning.ts server/utils/simpleAiOsProvisioning.test.ts .env.example
git commit -m "feat: add simple-ai-os cross-app tenant provisioning client"
```

---

## Task 7 (home): Wire the call into tenant provisioning

**Files:**
- Modify: `server/api/admin/tenants/index.post.ts`

- [ ] **Step 1: Read the current handler** (`server/api/admin/tenants/index.post.ts`) to confirm
  line numbers haven't shifted since this plan was written, then add one more non-fatal step
  after the existing `iam` app-registration `try`/`catch` block (which currently ends the
  handler) and before the final `return`:

```ts
  let simpleAiOsProvisioned = false
  try {
    const result = await provisionSimpleAiOsTenant({ slug, name })
    simpleAiOsProvisioned = result.ok
  } catch (error) {
    console.error('Error provisioning simple-ai-os tenant:', error)
  }

  return { success: true, slug, schemaName, simpleAiOsProvisioned }
```

  and add the import at the top:

```ts
import { provisionSimpleAiOsTenant } from '../../../utils/simpleAiOsProvisioning'
```

  Note `provisionSimpleAiOsTenant` already catches its own errors and returns `{ ok: false }`
  rather than throwing (Task 6) — the outer `try`/`catch` here is defense-in-depth only, so a
  bug in that util can never take down `home`'s own successful tenant creation.

- [ ] **Step 2: Run home's existing unit/e2e-api suite to confirm nothing else broke**

Run: `npm test` (from `web/home`)
Expected: PASS (the extended e2e-api test in Task 9 is what actually exercises this new code
path — this step just confirms the change compiles and doesn't break anything else first)

- [ ] **Step 3: Commit**

```bash
git add server/api/admin/tenants/index.post.ts
git commit -m "feat: provision the matching simple-ai-os tenant when provisioning a home tenant"
```

---

## Task 8 (home): Backfill script

**Files:**
- Create: `server/db/scripts/backfill-simple-ai-os-tenant.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the script**, mirroring `backfill-tenant-iam.ts`'s shape exactly (loop,
  try/catch per tenant, never abort the whole run):

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { tenants } from '../schema/public'
import { provisionSimpleAiOsTenant } from '../../utils/simpleAiOsProvisioning'

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tryyourideas'

async function main() {
  const sql = postgres(connectionString, { max: 1 })
  const db = drizzle(sql)
  const allTenants = await db.select().from(tenants)
  await sql.end()

  for (const tenant of allTenants) {
    const result = await provisionSimpleAiOsTenant({ slug: tenant.slug, name: tenant.companyName })
    if (result.ok) {
      console.log(`simple-ai-os: tenant "${tenant.slug}" ${result.alreadyExisted ? 'already provisioned' : 'provisioned'}`)
    } else {
      console.error(`simple-ai-os: failed to provision tenant "${tenant.slug}" — will need another retry`)
    }
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error)
  process.exit(1)
})
```

- [ ] **Step 2: Add the npm script**

```json
"db:backfill-simple-ai-os-tenant": "tsx server/db/scripts/backfill-simple-ai-os-tenant.ts"
```

- [ ] **Step 3: Commit**

```bash
git add server/db/scripts/backfill-simple-ai-os-tenant.ts package.json
git commit -m "feat: add backfill script to retry failed simple-ai-os tenant provisioning"
```

---

## Task 9 (home): Extend the real-server e2e-api test

**Files:**
- Modify: `test/e2e-api/admin-tenants-api.test.ts`

- [ ] **Step 1: Add a fake simple-ai-os server** next to the existing `fakeIam` stand-in, near
  the top of the file (same pattern: an `http.createServer`, listened on an ephemeral port,
  its URL wired into the relevant env var before `setup()` is called):

```ts
let fakeSimpleAiOsShouldFail = false
const fakeSimpleAiOs = http.createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    if (fakeSimpleAiOsShouldFail) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: 'simulated failure' }))
      return
    }
    const { slug } = JSON.parse(body || '{}')
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ success: true, slug, schemaName: `tenant_${slug}`, alreadyExisted: false }))
  })
})
await new Promise<void>((resolve) => fakeSimpleAiOs.listen(0, '127.0.0.1', resolve))
const fakeSimpleAiOsPort = (fakeSimpleAiOs.address() as { port: number }).port
process.env.NUXT_SIMPLE_AI_OS_URL = `http://127.0.0.1:${fakeSimpleAiOsPort}`
process.env.NUXT_SIMPLE_AI_OS_ADMIN_API_KEY = 'test-admin-api-key'
```

- [ ] **Step 2: Close it in the existing `afterAll`**, alongside `fakeIam.close(...)`:

```ts
    await new Promise<void>((resolve) => fakeSimpleAiOs.close(() => resolve()))
```

- [ ] **Step 3: Reset `fakeSimpleAiOsShouldFail` in the existing `beforeEach`** (next to the
  existing `truncatePublicTables()` call):

```ts
    fakeSimpleAiOsShouldFail = false
```

- [ ] **Step 4: Add two new test cases inside the existing `describe('POST /api/admin/tenants')` block**:

```ts
    it('also provisions the tenant in simple-ai-os and reports success', async () => {
      const cookie = await loginAsAdminApi()
      const slug = `e2e-simple-ai-os-ok-${Date.now()}`
      provisionedSchemas.push(`tenant_${slug}`)

      const result = await $fetch<{ simpleAiOsProvisioned: boolean }>('/api/admin/tenants', {
        method: 'POST',
        headers: { cookie },
        body: { name: 'Acme Test Co', slug, ownerName: 'Jane Owner', ownerEmail: 'jane@acme.com' },
      })

      expect(result.simpleAiOsProvisioned).toBe(true)
    })

    it('still succeeds and reports simpleAiOsProvisioned: false when simple-ai-os is unreachable or fails', async () => {
      fakeSimpleAiOsShouldFail = true
      const cookie = await loginAsAdminApi()
      const slug = `e2e-simple-ai-os-fail-${Date.now()}`
      provisionedSchemas.push(`tenant_${slug}`)

      const result = await $fetch<{ success: boolean, simpleAiOsProvisioned: boolean }>('/api/admin/tenants', {
        method: 'POST',
        headers: { cookie },
        body: { name: 'Acme Test Co', slug, ownerName: 'Jane Owner', ownerEmail: 'jane@acme.com' },
      })

      expect(result.success).toBe(true)
      expect(result.simpleAiOsProvisioned).toBe(false)

      const [savedTenant] = await getTestPublicDb().select().from(tenants).where(eq(tenants.slug, slug))
      expect(savedTenant).toBeDefined()
    })
```

- [ ] **Step 5: Run the extended test file**

Run: `npm run test:e2e-api -- admin-tenants-api` (from `web/home`, against a real local
Postgres per that suite's existing setup)
Expected: PASS, including the two new cases.

- [ ] **Step 6: Run home's full test suite**

Run: `npm test` (from `web/home`)
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add test/e2e-api/admin-tenants-api.test.ts
git commit -m "test: cover cross-app simple-ai-os tenant provisioning success and failure paths"
```

---

## Self-review notes

- **Spec coverage**: all 6 numbered decisions map to a task — call semantics (Task 7), auth
  (Tasks 2, 6), reusable/non-duplicated provisioning logic (Task 1), idempotency (Task 1, Step
  3's check-before-insert), the new endpoint (Task 3), retry-via-backfill-not-UI (Task 8).
- **Type consistency**: `provisionTenant()`'s `{ schemaName, alreadyExisted }` return shape is
  used consistently by the CLI script (Task 1), the HTTP endpoint (Task 3), and is what
  `provisionSimpleAiOsTenant()` (Task 6, `home` side) expects back over the wire.
- **Non-fatal failure guarantee verified at three layers**: `provisionSimpleAiOsTenant()`
  itself never throws (Task 6), `home`'s endpoint wraps the call in its own `try`/`catch`
  anyway as defense-in-depth (Task 7), and the e2e-api test (Task 9) proves the tenant is still
  created even when simple-ai-os fails.
- **Out-of-scope items respected**: no `home` admin UI changes, no changes to SSO/session
  behavior — only the two files' worth of new provisioning/backfill code plus tests and docs.
