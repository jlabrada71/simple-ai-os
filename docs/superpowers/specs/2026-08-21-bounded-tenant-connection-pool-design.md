# Design: bounded per-tenant connection pool cache

## Context

`server/db/client.ts`'s `getTenantDb(schemaName)` (both `home` and `simple-ai-os` — the
latter's own copy explicitly says "Mirrors web/home's server/db/client.ts") caches one
connection pool per tenant schema in a plain `Map`, forever. Nothing ever closes or evicts an
entry. Each pool defaults to the driver's own `max` (10 for both `postgres` and `pg`). A process
that ends up touching enough distinct tenants over its lifetime accumulates unbounded
connections against Postgres, which has a finite `max_connections` (100 by default, confirmed
on the shared local instance both apps' dev Postgres runs on).

This was found while root-causing (see `home`'s `docs/learnings/e2e-testing.md`) two flaky
`test/e2e-api/admin-tenants-api.test.ts` failures traced to `PostgresError: sorry, too many
clients already` — a large e2e-api run provisions dozens of distinct tenant schemas, and
running test files in parallel multiplies the simultaneous pool count past what the shared
Postgres instance allows. The same failure mode applies in production: both apps run as a
single long-lived Node process (default Nitro `node-server` preset, no serverless/per-request
cold start), so the leak is real over the server's uptime, not a test artifact.

Both `home` and `simple-ai-os` get the identical fix, adapted to each app's own driver
(`postgres-js` for `home`, `pg` for `simple-ai-os`).

## Decision

Replace the unbounded `Map` with a small hand-rolled LRU cache capped at **20** tenant pools,
and reduce each pool's own `max` connections to **3** (down from the driver default of 10).
Worst case: `20 × 3 = 60` connections from tenant traffic, leaving headroom under
`max_connections: 100` alongside `publicDb`'s own pool and other processes on the same
instance.

**Why cap pool *count*, not just add an idle-timeout sweep**: an idle-timeout (close pools
unused for N minutes) doesn't bound the *transient* spike that caused the original failure — a
burst of traffic (or a test run) touching many distinct tenants within the idle window still
opens that many pools before any sweep fires. A hard cap on cached pool count, evicting the
least-recently-used pool whenever a new tenant would exceed it, bounds worst-case connections
regardless of traffic pattern — which is the actual failure mode observed.

**LRU without a new dependency**: a JS `Map` iterates in insertion order. "Delete the key, then
re-insert it" on every touch (both on cache hit and on a fresh insert) keeps the map ordered
oldest-to-newest, so `map.keys().next().value` is always the least-recently-used entry to evict.
No library needed for a cache this small and single-purpose.

**Eviction safety**: eviction only happens when *inserting a new* tenant pool would cross the
cap — the entry currently being returned to the caller is never the one evicted. Both drivers'
`.end()` are graceful: `postgres-js`'s `pool.end({ timeout: 5 })` waits up to 5s for in-flight
queries before closing; `pg`'s `Pool.end()` already waits for checked-out clients to be
released. So a query in flight on a pool that gets evicted from a *different*, concurrent
request finishes normally — only new checkouts against that schema are refused afterward (and
immediately reopen a fresh pool on the next `getTenantDb` call for that schema, same as any
other cache miss).

## Implementation shape

`home` (`server/db/client.ts`, `postgres-js`):

```typescript
const TENANT_POOL_CACHE_SIZE = 20
const TENANT_POOL_MAX_CONNECTIONS = 3

const tenantClients = new Map<string, ReturnType<typeof drizzle>>()
const tenantSqlClients = new Map<string, ReturnType<typeof postgres>>()

function touchTenant(schemaName: string) {
  const db = tenantClients.get(schemaName)!
  const sql = tenantSqlClients.get(schemaName)!
  tenantClients.delete(schemaName)
  tenantSqlClients.delete(schemaName)
  tenantClients.set(schemaName, db)
  tenantSqlClients.set(schemaName, sql)
}

function evictOldestIfNeeded() {
  if (tenantClients.size < TENANT_POOL_CACHE_SIZE) return
  const oldest = tenantClients.keys().next().value!
  const oldestSql = tenantSqlClients.get(oldest)
  tenantClients.delete(oldest)
  tenantSqlClients.delete(oldest)
  oldestSql?.end({ timeout: 5 })
}

function getTenantDb(schemaName: string) {
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
```

`simple-ai-os` (`server/db/client.ts`, `pg`) — identical shape, adapted for `pg.Pool`:

```typescript
const TENANT_POOL_CACHE_SIZE = 20
const TENANT_POOL_MAX_CONNECTIONS = 3

const tenantClients = new Map<string, ReturnType<typeof drizzle>>()
const tenantPools = new Map<string, Pool>()

function touchTenant(schemaName: string) {
  const db = tenantClients.get(schemaName)!
  const pool = tenantPools.get(schemaName)!
  tenantClients.delete(schemaName)
  tenantPools.delete(schemaName)
  tenantClients.set(schemaName, db)
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
```

Note both need a *second* map (`tenantSqlClients`/`tenantPools`) alongside the existing
`tenantClients` map, since the cached value today is the Drizzle-wrapped client, but eviction
needs the underlying raw `postgres`/`pg.Pool` handle to call `.end()` on — Drizzle doesn't
expose a handle to close the connection it wraps.

## Testing

Both repos get a new `server/db/client.test.ts` (or extend the existing one, if a repo already
has one — `simple-ai-os` does: `server/db/client.test.ts`, currently minimal) covering:
- Requesting the same schema twice returns the same cached `db` instance (no new pool opened).
- Requesting the 21st distinct schema evicts the 1st (least-recently-used) — assert its pool's
  `.end()` was called, and that the 1st schema's *next* request opens a fresh pool (not the
  evicted one).
- Touching an existing entry (a repeat request for a schema already in the cache) protects it
  from eviction — insert 19 tenants, re-touch the 1st, insert one more (21st distinct) — assert
  the 2nd (least-recently-touched), not the 1st, gets evicted.

These need the underlying `postgres`/`pg.Pool` constructor mocked (same pattern already used in
`simple-ai-os/server/lib/provisionTenant.test.ts` for `pg`), since real connections aren't
opened in unit tests.

## Out of scope

- Making the cap/max-connections configurable via env var — hardcoded constants are fine for
  now (YAGNI); revisit only if real traffic data says the defaults are wrong.
- Switching to a single shared pool with per-query `search_path` instead of per-tenant pools —
  a much larger architectural change or the per-tenant-pool pattern itself entirely; not
  needed to fix the specific unbounded-growth bug.
- Metrics/observability on cache hit rate or eviction frequency — not needed to fix the bug;
  can be added later if eviction thrashing turns out to be a real problem at higher tenant
  counts than 20.
