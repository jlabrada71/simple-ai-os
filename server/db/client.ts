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
