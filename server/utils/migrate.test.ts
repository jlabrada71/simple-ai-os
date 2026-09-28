import { describe, expect, it, vi } from 'vitest'

const { migrateMock } = vi.hoisted(() => ({ migrateMock: vi.fn().mockResolvedValue(undefined) }))
vi.mock('drizzle-orm/node-postgres/migrator', () => ({ migrate: migrateMock }))
vi.mock('../db/client', () => ({ publicDb: {}, db: {} }))

import { runPublicMigrations } from './migrate'

describe('runPublicMigrations', () => {
  it('materializes the storage-backed migration assets to a temp dir and runs migrate() against it', async () => {
    const storage = {
      getKeys: async () => ['0000_init.sql', 'meta:_journal.json'],
      getItem: async (key: string) =>
        key === 'meta:_journal.json' ? JSON.stringify({ entries: [{ tag: '0000_init' }] }) : 'CREATE TABLE x();',
    }

    await runPublicMigrations(storage)

    expect(migrateMock).toHaveBeenCalledTimes(1)
    const [, options] = migrateMock.mock.calls[0]
    expect(options.migrationsFolder).toEqual(expect.any(String))
  })
})
