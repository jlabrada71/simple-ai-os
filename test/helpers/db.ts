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
