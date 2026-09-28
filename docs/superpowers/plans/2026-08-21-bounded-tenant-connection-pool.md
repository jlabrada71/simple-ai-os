# Bounded Tenant Connection Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `getTenantDb`'s per-tenant connection pool cache from growing without bound in
both `home` and `simple-ai-os` — cap it at 20 cached pools with LRU eviction, and reduce each
pool's own `max` connections to 3.

**Architecture:** Replace each app's plain `Map<string, DrizzleClient>` cache with a
delete-then-reinsert LRU (insertion order in a `Map` gives LRU ordering for free), plus a
second map holding the raw driver handle (`postgres`/`pg.Pool`) so eviction can call `.end()`
on it. Identical shape in both repos, adapted per driver.

**Tech Stack:** TypeScript, Drizzle ORM, `postgres` (home), `pg` (simple-ai-os), Vitest.

**Reference:** `docs/superpowers/specs/2026-08-21-bounded-tenant-connection-pool-design.md`

---

## Task 1: `simple-ai-os` — bounded tenant pool cache

**Files:**
- Modify: `server/db/client.ts`
- Modify: `server/db/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `server/db/client.test.ts` in full with:

```typescript
import { describe, expect, it } from 'vitest'
import { getTenantDb } from './client'

describe('getTenantDb', () => {
  it('returns the same cached client for the same schema name', () => {
    const a = getTenantDb('tenant_acme')
    const b = getTenantDb('tenant_acme')
    expect(a).toBe(b)
  })

  it('returns a different client for a different schema name', () => {
    const a = getTenantDb('tenant_acme2')
    const b = getTenantDb('tenant_other2')
    expect(a).not.toBe(b)
  })

  it('evicts the least-recently-used pool once the cache exceeds 20 entries', () => {
    const first = getTenantDb('tenant_lru_0')
    for (let i = 1; i < 20; i++) {
      getTenantDb(`tenant_lru_${i}`)
    }
    // Cache is now full (20 entries: tenant_lru_0..19). One more distinct
    // schema must evict tenant_lru_0, the least-recently-used.
    getTenantDb('tenant_lru_20')

    const firstAgain = getTenantDb('tenant_lru_0')
    expect(firstAgain).not.toBe(first)
  })

  it('touching an entry protects it from eviction', () => {
    const protectedClient = getTenantDb('tenant_protected')
    for (let i = 0; i < 19; i++) {
      getTenantDb(`tenant_fill_${i}`)
    }
    // Cache is now full (20 entries: tenant_protected + tenant_fill_0..18).
    // Re-touch tenant_protected so it's no longer the least-recently-used.
    getTenantDb('tenant_protected')
    // One more distinct schema should evict tenant_fill_0 (now
    // least-recently-used), not tenant_protected.
    getTenantDb('tenant_new_after_touch')

    const protectedAgain = getTenantDb('tenant_protected')
    expect(protectedAgain).toBe(protectedClient)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/db/client.test.ts`
Expected: the two new tests FAIL (the LRU cache doesn't evict at all yet — the 21st distinct
schema in the third test won't have evicted `tenant_lru_0`, so `firstAgain` will be the same
cached client, not a new one)

- [ ] **Step 3: Update the implementation**

Replace `server/db/client.ts` in full with:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/simple-ai-os'

export const db = new Pool({ connectionString })
export const publicDb = drizzle(db)

const TENANT_POOL_CACHE_SIZE = 20
const TENANT_POOL_MAX_CONNECTIONS = 3

const tenantClients = new Map<string, ReturnType<typeof drizzle>>()
const tenantPools = new Map<string, Pool>()

function touchTenant(schemaName: string) {
  const client = tenantClients.get(schemaName)!
  const pool = tenantPools.get(schemaName)!
  tenantClients.delete(schemaName)
  tenantPools.delete(schemaName)
  tenantClients.set(schemaName, client)
  tenantPools.set(schemaName, pool)
}

function evictOldestIfNeeded() {
  if (tenantClients.size < TENANT_POOL_CACHE_SIZE) return
  const oldest = tenantClients.keys().next().value!
  const oldestPool = tenantPools.get(oldest)
  tenantClients.delete(oldest)
  tenantPools.delete(oldest)
  oldestPool?.end()
}

/**
 * Returns a cached Drizzle client for the given tenant schema, backed by a
 * dedicated connection pool whose search_path is fixed to that schema (with
 * public as fallback) via the libpq `-c search_path=...` startup option - so
 * every connection in the pool always queries the right tenant, no
 * per-query SET search_path needed. Mirrors web/home's server/db/client.ts,
 * adapted for the pg (node-postgres) driver this app already uses.
 *
 * Capped at TENANT_POOL_CACHE_SIZE cached pools (LRU-evicted) with a small
 * per-pool TENANT_POOL_MAX_CONNECTIONS, so a process that ends up touching
 * many distinct tenants over its lifetime can't accumulate unbounded
 * Postgres connections - see docs/architecture/ADR (home's
 * 0001-align-drizzle-orm-version-with-nuxt-iam-client.md) and
 * docs/superpowers/specs/2026-08-21-bounded-tenant-connection-pool-design.md.
 */
export function getTenantDb(schemaName: string) {
  if (tenantClients.has(schemaName)) {
    touchTenant(schemaName)
    return tenantClients.get(schemaName)!
  }

  evictOldestIfNeeded()

  const pool = new Pool({
    connectionString,
    max: TENANT_POOL_MAX_CONNECTIONS,
    options: `-c search_path=${schemaName},public`,
  })
  const client = drizzle(pool)
  tenantClients.set(schemaName, client)
  tenantPools.set(schemaName, pool)
  return client
}

export async function withTenantDb<T>(
  schemaName: string,
  fn: (db: ReturnType<typeof drizzle>) => Promise<T>,
): Promise<T> {
  return fn(getTenantDb(schemaName))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/db/client.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS, same count as before this change

- [ ] **Step 6: Commit**

```bash
git add server/db/client.ts server/db/client.test.ts
git commit -m "bugfix: cap the per-tenant connection pool cache with LRU eviction"
```

---

## Task 2: `home` — bounded tenant pool cache

**Files:**
- Modify: `server/db/client.ts`
- Create: `test/unit/tenant-db-client.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/unit/tenant-db-client.test.ts
import { describe, expect, it } from 'vitest'
import { getTenantDb } from '../../server/db/client'

describe('getTenantDb', () => {
  it('returns the same cached client for the same schema name', () => {
    const a = getTenantDb('tenant_acme')
    const b = getTenantDb('tenant_acme')
    expect(a).toBe(b)
  })

  it('returns a different client for a different schema name', () => {
    const a = getTenantDb('tenant_acme2')
    const b = getTenantDb('tenant_other2')
    expect(a).not.toBe(b)
  })

  it('evicts the least-recently-used pool once the cache exceeds 20 entries', () => {
    const first = getTenantDb('tenant_lru_0')
    for (let i = 1; i < 20; i++) {
      getTenantDb(`tenant_lru_${i}`)
    }
    // Cache is now full (20 entries: tenant_lru_0..19). One more distinct
    // schema must evict tenant_lru_0, the least-recently-used.
    getTenantDb('tenant_lru_20')

    const firstAgain = getTenantDb('tenant_lru_0')
    expect(firstAgain).not.toBe(first)
  })

  it('touching an entry protects it from eviction', () => {
    const protectedClient = getTenantDb('tenant_protected')
    for (let i = 0; i < 19; i++) {
      getTenantDb(`tenant_fill_${i}`)
    }
    // Cache is now full (20 entries: tenant_protected + tenant_fill_0..18).
    // Re-touch tenant_protected so it's no longer the least-recently-used.
    getTenantDb('tenant_protected')
    // One more distinct schema should evict tenant_fill_0 (now
    // least-recently-used), not tenant_protected.
    getTenantDb('tenant_new_after_touch')

    const protectedAgain = getTenantDb('tenant_protected')
    expect(protectedAgain).toBe(protectedClient)
  })
})
```

`getTenantDb` isn't exported from `home`'s `server/db/client.ts` today — Step 3 below exports
it (needed for this test to import it directly, matching the already-exported pattern
`simple-ai-os` uses for the same function).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit test/unit/tenant-db-client.test.ts`
Expected: FAIL — `getTenantDb` is not exported yet (`Cannot find export 'getTenantDb'`, or a
TS error), and the LRU eviction tests would fail regardless since eviction doesn't exist yet.

- [ ] **Step 3: Update the implementation**

Replace `server/db/client.ts` in full with:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tryyourideas'

const sql = postgres(connectionString)

export const publicDb = drizzle(sql)

const TENANT_POOL_CACHE_SIZE = 20
const TENANT_POOL_MAX_CONNECTIONS = 3

const tenantClients = new Map<string, ReturnType<typeof drizzle>>()
const tenantSqlClients = new Map<string, ReturnType<typeof postgres>>()

function touchTenant(schemaName: string) {
  const db = tenantClients.get(schemaName)!
  const tenantSql = tenantSqlClients.get(schemaName)!
  tenantClients.delete(schemaName)
  tenantSqlClients.delete(schemaName)
  tenantClients.set(schemaName, db)
  tenantSqlClients.set(schemaName, tenantSql)
}

function evictOldestIfNeeded() {
  if (tenantClients.size < TENANT_POOL_CACHE_SIZE) return
  const oldest = tenantClients.keys().next().value!
  const oldestSql = tenantSqlClients.get(oldest)
  tenantClients.delete(oldest)
  tenantSqlClients.delete(oldest)
  oldestSql?.end({ timeout: 5 })
}

/**
 * Returns a cached Drizzle client for the given tenant schema, backed by a
 * dedicated connection pool whose search_path is fixed to that schema (with
 * public as fallback) at the Postgres startup-parameter level - so every
 * connection in the pool always queries the right tenant, no per-query
 * search_path juggling needed.
 *
 * Capped at TENANT_POOL_CACHE_SIZE cached pools (LRU-evicted) with a small
 * per-pool TENANT_POOL_MAX_CONNECTIONS, so a process that ends up touching
 * many distinct tenants over its lifetime can't accumulate unbounded
 * Postgres connections - see
 * docs/architecture/ADR/0001-align-drizzle-orm-version-with-nuxt-iam-client.md
 * and simple-ai-os's
 * docs/superpowers/specs/2026-08-21-bounded-tenant-connection-pool-design.md.
 */
export function getTenantDb(schemaName: string) {
  if (tenantClients.has(schemaName)) {
    touchTenant(schemaName)
    return tenantClients.get(schemaName)!
  }

  evictOldestIfNeeded()

  const tenantSql = postgres(connectionString, {
    max: TENANT_POOL_MAX_CONNECTIONS,
    connection: { search_path: `${schemaName},public` },
  })
  const db = drizzle(tenantSql)
  tenantClients.set(schemaName, db)
  tenantSqlClients.set(schemaName, tenantSql)
  return db
}

export async function withTenantDb<T>(
  schemaName: string,
  fn: (db: ReturnType<typeof drizzle>) => Promise<T>
): Promise<T> {
  return fn(getTenantDb(schemaName))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project unit test/unit/tenant-db-client.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `npm test`
Expected: PASS, same count as before this change (206 + 4 new = 210)

- [ ] **Step 6: Commit**

```bash
git add server/db/client.ts test/unit/tenant-db-client.test.ts
git commit -m "bugfix: cap the per-tenant connection pool cache with LRU eviction"
```

---

## Task 3: Documentation

**Files:**
- Modify: `docs/pending-tasks.md` (home)
- Modify: `docs/changes.md` (home)
- Modify: `docs/changes.md` (simple-ai-os)

- [ ] **Step 1: Update `home`'s `docs/pending-tasks.md`**

Remove the "Give `withTenantDb`'s per-tenant connection pool cache... an eviction policy" item
entirely (it's now done) — delete that whole bullet, from `- **Give \`withTenantDb\`'s...`
through its `**Consequence of not doing it**:` paragraph.

- [ ] **Step 2: Update `home`'s `docs/changes.md`**

Prepend a new entry at the top, under the `# Changes` header:

```markdown
## 2026-08-21 (bounded tenant connection pool)

- **Capped `getTenantDb`'s per-tenant connection pool cache at 20 entries with LRU eviction**
  (`server/db/client.ts`), and reduced each pool's own `max` connections from the driver
  default (10) to 3. Previously unbounded — see
  `docs/learnings/e2e-testing.md` for how this surfaced as flaky e2e-api test failures
  (`PostgresError: sorry, too many clients already`) once enough distinct tenants
  accumulated in a single process. `simple-ai-os` has the identical fix — see
  `simple-ai-os/docs/superpowers/specs/2026-08-21-bounded-tenant-connection-pool-design.md`.
```

- [ ] **Step 3: Update `simple-ai-os`'s `docs/changes.md`**

Prepend a matching entry at the top, under the `# Changes` header:

```markdown
## 2026-08-21 (bounded tenant connection pool)

- **Capped `getTenantDb`'s per-tenant connection pool cache at 20 entries with LRU eviction**
  (`server/db/client.ts`), and reduced each pool's own `max` connections from the driver
  default (10) to 3. Previously unbounded, mirroring the same bug found and fixed in `home`.
  See `docs/superpowers/specs/2026-08-21-bounded-tenant-connection-pool-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/pending-tasks.md docs/changes.md
git commit -m "docs: record bounded tenant connection pool fix"
```

```bash
cd ../simple-ai-os
git add docs/changes.md
git commit -m "docs: record bounded tenant connection pool fix"
```

---

## Final verification

- [ ] `home`: `npm test` passes in full.
- [ ] `simple-ai-os`: `npx vitest run` passes in full.
- [ ] `home`: re-run the e2e-api connection-exhaustion check that originally surfaced this bug —
      `DATABASE_URL=<local test db url> npx vitest run --config vitest.e2e-api.config.ts`
      (default parallel mode this time, not `--no-file-parallelism`) — confirm
      `admin-tenants-api.test.ts`'s two previously-flaky tests now pass without the flag
      workaround. If they still fail under parallel load, that's useful data (the cap of
      20/max of 3 may need tuning) but is not a blocker for merging this fix, since it's still
      a strict improvement over the fully unbounded cache.
- [ ] Proceed to `superpowers:finishing-a-development-branch` once all tasks are checked off,
      for both repos.
