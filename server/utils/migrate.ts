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
