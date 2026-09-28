import { describe, expect, it, vi } from 'vitest'

function createFakeDb() {
  const insertReturning = vi.fn()
  const insertValues = vi.fn(() => ({ returning: insertReturning }))
  const insert = vi.fn(() => ({ values: insertValues }))

  const selectOrderBy = vi.fn()
  const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }))
  const selectFrom = vi.fn(() => ({ where: selectWhere }))
  const select = vi.fn(() => ({ from: selectFrom }))

  const deleteWhere = vi.fn().mockResolvedValue(undefined)
  const del = vi.fn(() => ({ where: deleteWhere }))

  return { insert, insertValues, insertReturning, select, selectFrom, selectWhere, selectOrderBy, delete: del, deleteWhere } as any
}

describe('createApiKey', () => {
  it('generates a sao_-prefixed token, stores only its hash, and returns the plaintext token once', async () => {
    const db = createFakeDb()
    db.insertReturning.mockResolvedValue([{ id: 'k1', userId: 'u1', name: 'my key', createdAt: new Date(), lastUsedAt: null }])

    const { createApiKey } = await import('./apiKeys')
    const result = await createApiKey(db, 'u1', 'my key')

    expect(result.token).toMatch(/^sao_/)
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', name: 'my key', keyHash: expect.not.stringMatching(result.token) }),
    )
    expect(result.token.length).toBeGreaterThan(20)
  })
})

describe('listApiKeys', () => {
  it("returns the user's keys without the hash or token", async () => {
    const db = createFakeDb()
    const rows = [{ id: 'k1', name: 'a', createdAt: new Date(), lastUsedAt: null }]
    db.selectOrderBy.mockResolvedValue(rows)

    const { listApiKeys } = await import('./apiKeys')
    expect(await listApiKeys(db, 'u1')).toEqual(rows)
  })
})

describe('deleteApiKey', () => {
  it('deletes only when the key belongs to the given user', async () => {
    const db = createFakeDb()

    const { deleteApiKey } = await import('./apiKeys')
    await deleteApiKey(db, 'k1', 'u1')

    expect(db.delete).toHaveBeenCalled()
  })
})
