import { describe, expect, it, vi } from 'vitest'

function createFakeDb() {
  // orderBy() must behave two ways depending on the real call site: directly
  // awaitable (listThreads/getThreadMessages end their chain at .orderBy()),
  // and chainable to a further .limit() (getOrCreateLatestThread does
  // .orderBy().limit(1)). Returning a Promise with a .limit property tacked
  // on satisfies both without the test needing to know which shape a given
  // production function will use.
  let orderByRows: unknown[] = []
  const selectLimit = vi.fn()
  const selectOrderBy = vi.fn(() => Object.assign(Promise.resolve(orderByRows), { limit: selectLimit }))
  const setOrderByRows = (rows: unknown[]) => { orderByRows = rows }

  const selectFrom = vi.fn((_table: unknown) => ({
    where: (..._args: unknown[]) => ({ limit: selectLimit, orderBy: selectOrderBy }),
  }))
  const select = vi.fn(() => ({ from: selectFrom }))

  const insertReturning = vi.fn()
  const insertValues = vi.fn(() => ({ returning: insertReturning }))
  const insert = vi.fn(() => ({ values: insertValues }))

  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))

  const transaction = vi.fn()

  return { select, selectFrom, selectLimit, selectOrderBy, setOrderByRows, insert, insertValues, insertReturning, update, updateSet, updateWhere, transaction } as any
}

describe('createThread', () => {
  it('inserts a thread row with a null title for the given user', async () => {
    const db = createFakeDb()
    db.insertReturning.mockResolvedValue([{ id: 't1', userId: 'u1', title: null, createdAt: new Date(), updatedAt: new Date() }])

    const { createThread } = await import('./threads')
    const result = await createThread(db, 'u1')

    expect(db.insertValues).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }))
    expect(result.id).toBe('t1')
  })
})

describe('listThreads', () => {
  it('returns the users threads ordered by updatedAt descending', async () => {
    const db = createFakeDb()
    const rows = [{ id: 't2', title: 'b' }, { id: 't1', title: 'a' }]
    db.setOrderByRows(rows)

    const { listThreads } = await import('./threads')
    const result = await listThreads(db, 'u1')

    expect(result).toEqual(rows)
  })
})

describe('getThreadForUser', () => {
  it('returns null when no thread matches (wrong id or wrong owner)', async () => {
    const db = createFakeDb()
    db.selectLimit.mockResolvedValue([])

    const { getThreadForUser } = await import('./threads')
    expect(await getThreadForUser(db, 't1', 'u1')).toBeNull()
  })

  it('returns the thread when it belongs to the given user', async () => {
    const db = createFakeDb()
    const thread = { id: 't1', userId: 'u1' }
    db.selectLimit.mockResolvedValue([thread])

    const { getThreadForUser } = await import('./threads')
    expect(await getThreadForUser(db, 't1', 'u1')).toEqual(thread)
  })
})

describe('getOrCreateLatestThread', () => {
  it('returns the most recently updated existing thread without creating a new one', async () => {
    const db = createFakeDb()
    const existing = { id: 't1', userId: 'u1', title: 'hi' }
    db.selectLimit.mockResolvedValue([existing])

    const { getOrCreateLatestThread } = await import('./threads')
    const result = await getOrCreateLatestThread(db, 'u1')

    expect(result).toEqual(existing)
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('creates a new thread when the user has none yet', async () => {
    const db = createFakeDb()
    db.selectLimit.mockResolvedValue([])
    const created = { id: 't1', userId: 'u1', title: null }
    db.insertReturning.mockResolvedValue([created])

    const { getOrCreateLatestThread } = await import('./threads')
    const result = await getOrCreateLatestThread(db, 'u1')

    expect(result).toEqual(created)
  })
})

describe('getThreadMessages', () => {
  it('returns a threads messages ordered oldest first', async () => {
    const db = createFakeDb()
    const rows = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]
    db.setOrderByRows(rows)

    const { getThreadMessages } = await import('./threads')
    expect(await getThreadMessages(db, 't1')).toEqual(rows)
  })
})

describe('recordExchange', () => {
  it('inserts a user+assistant message pair, sets the title from the user message on first exchange, and bumps updatedAt', async () => {
    const db = createFakeDb()
    const tx = createFakeDb()
    db.transaction.mockImplementation(async (cb: any) => cb(tx))
    tx.selectLimit.mockResolvedValue([{ id: 't1', title: null }])

    const { recordExchange } = await import('./threads')
    await recordExchange(db, 't1', 'hello there, how are you?', 'I am fine')

    expect(tx.insertValues).toHaveBeenCalledWith(expect.objectContaining({ threadId: 't1', role: 'user', content: 'hello there, how are you?' }))
    expect(tx.insertValues).toHaveBeenCalledWith(expect.objectContaining({ threadId: 't1', role: 'assistant', content: 'I am fine' }))
    expect(tx.updateSet).toHaveBeenCalledWith(expect.objectContaining({ title: 'hello there, how are you?' }))
  })

  it('does not overwrite an existing title on later exchanges', async () => {
    const db = createFakeDb()
    const tx = createFakeDb()
    db.transaction.mockImplementation(async (cb: any) => cb(tx))
    tx.selectLimit.mockResolvedValue([{ id: 't1', title: 'existing title' }])

    const { recordExchange } = await import('./threads')
    await recordExchange(db, 't1', 'another message', 'another reply')

    expect(tx.updateSet).toHaveBeenCalledWith(expect.objectContaining({ title: 'existing title' }))
  })
})
