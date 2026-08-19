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
