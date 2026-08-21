import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { tenants } from '../db/schema/public'
import { registerTenantIamApp } from '../utils/tenantIamRegistration'
import { getTenantIamAppConfig, storeTenantIamAppConfig } from '../utils/tenantIamConfig'
import { setPendingAdminEmail } from '../utils/pendingAdminEmail'

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/simple-ai-os'

export interface ProvisionTenantInput {
  slug: string
  name: string
  ownerEmail?: string
}

export interface ProvisionTenantResult {
  schemaName: string
  alreadyExisted: boolean
}

export async function provisionTenant({ slug, name, ownerEmail }: ProvisionTenantInput): Promise<ProvisionTenantResult> {
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

  if (ownerEmail) {
    await setPendingAdminEmail(tenantDb, ownerEmail)
  }

  const existingIamConfig = await getTenantIamAppConfig(tenantDb, 'simple-ai-os')
  if (!existingIamConfig) {
    const registered = await registerTenantIamApp({ appName: name, slug })
    await storeTenantIamAppConfig(tenantDb, 'simple-ai-os', registered)
  }

  await tenantPool.end()

  return { schemaName, alreadyExisted: false }
}
