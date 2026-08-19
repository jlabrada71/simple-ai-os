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
