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
 * Postgres connections - see
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
