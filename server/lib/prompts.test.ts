import { describe, expect, it, vi } from 'vitest'
import { createPromptSchema, listPromptsQuerySchema, updatePromptSchema } from './prompts'

function createFakeTx() {
  const selectWhere = vi.fn()
  const selectFrom = vi.fn(() => ({ where: selectWhere }))
  const select = vi.fn(() => ({ from: selectFrom }))

  const updateReturning = vi.fn()
  const updateWhere = vi.fn(() => ({ returning: updateReturning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))

  const deleteReturning = vi.fn()
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }))
  const del = vi.fn(() => ({ where: deleteWhere }))

  const insertValues = vi.fn().mockResolvedValue(undefined)
  const insert = vi.fn(() => ({ values: insertValues }))

  return { select, selectWhere, update, updateReturning, delete: del, deleteReturning, insert, insertValues }
}

vi.mock('../db/client', () => {
  const returning = vi.fn()
  const values = vi.fn(() => ({ returning }))
  const insert = vi.fn(() => ({ values }))

  const deleteReturning = vi.fn()
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }))
  const del = vi.fn(() => ({ where: deleteWhere }))

  const selectOrderBy = vi.fn()
  const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }))
  const selectFrom = vi.fn(() => ({ where: selectWhere }))
  const select = vi.fn(() => ({ from: selectFrom }))

  const transaction = vi.fn()

  return { db: { insert, delete: del, select, transaction } }
})

describe('createPromptSchema', () => {
  it('accepts a minimal valid input', () => {
    const result = createPromptSchema.parse({ name: 'greeting', content: 'Hello!' })
    expect(result).toEqual({ name: 'greeting', content: 'Hello!' })
  })

  it('rejects an empty name', () => {
    expect(() => createPromptSchema.parse({ name: '', content: 'Hello!' })).toThrow()
  })

  it('rejects an empty content', () => {
    expect(() => createPromptSchema.parse({ name: 'greeting', content: '' })).toThrow()
  })

  it('rejects a missing name', () => {
    expect(() => createPromptSchema.parse({ content: 'Hello!' })).toThrow()
  })
})

describe('updatePromptSchema', () => {
  it('accepts a partial update with a single field', () => {
    const result = updatePromptSchema.parse({ content: 'Updated!' })
    expect(result).toEqual({ content: 'Updated!' })
  })

  it('rejects an empty update body', () => {
    expect(() => updatePromptSchema.parse({})).toThrow()
  })

  it('rejects an empty-string field', () => {
    expect(() => updatePromptSchema.parse({ name: '' })).toThrow()
  })
})

describe('listPromptsQuerySchema', () => {
  it('defaults limit to 20 and offset to 0 when omitted', () => {
    const result = listPromptsQuerySchema.parse({})
    expect(result).toEqual({ limit: 20, offset: 0 })
  })

  it('coerces string query params to numbers', () => {
    const result = listPromptsQuerySchema.parse({ limit: '10', offset: '5' })
    expect(result).toEqual({ limit: 10, offset: 5 })
  })

  it('rejects a limit above 100', () => {
    expect(() => listPromptsQuerySchema.parse({ limit: '101' })).toThrow()
  })

  it('rejects a negative offset', () => {
    expect(() => listPromptsQuerySchema.parse({ offset: '-1' })).toThrow()
  })

  it('passes through an optional tag filter', () => {
    const result = listPromptsQuerySchema.parse({ tag: 'math' })
    expect(result).toEqual({ limit: 20, offset: 0, tag: 'math' })
  })
})

describe('createPrompt', () => {
  it('inserts the validated input and returns the created row', async () => {
    const { db } = await import('../db/client')
    const { createPrompt } = await import('./prompts')

    const fakeRow = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'greeting',
      content: 'Hello!',
      description: null,
      tags: [],
      variables: [],
      version: 1,
      score: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    ;(db.insert as any)().values().returning.mockResolvedValue([fakeRow])

    const result = await createPrompt({ name: 'greeting', content: 'Hello!' })

    expect(result).toEqual(fakeRow)
  })

  it('rejects invalid input before touching the database', async () => {
    const { createPrompt } = await import('./prompts')
    await expect(createPrompt({ name: '', content: 'Hello!' })).rejects.toThrow()
  })
})

describe('isUniqueViolation', () => {
  it('detects a raw pg error with code 23505', async () => {
    const { isUniqueViolation } = await import('./prompts')
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it('detects a Drizzle-wrapped pg error (code nested under .cause)', async () => {
    const { isUniqueViolation } = await import('./prompts')
    expect(isUniqueViolation({ message: 'Failed query', cause: { code: '23505' } })).toBe(true)
  })

  it('returns false for unrelated errors', async () => {
    const { isUniqueViolation } = await import('./prompts')
    expect(isUniqueViolation(new Error('boom'))).toBe(false)
  })
})

const fakeCurrentRow = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'greeting',
  content: 'Hello!',
  description: null,
  tags: [],
  variables: [],
  version: 1,
  score: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

describe('updatePrompt', () => {
  it('snapshots the pre-update row into prompt_history with action "updated", then applies the update', async () => {
    const { db } = await import('../db/client')
    const { updatePrompt } = await import('./prompts')

    const tx = createFakeTx()
    ;(db.transaction as any).mockImplementation(async (cb: any) => cb(tx))
    tx.selectWhere.mockResolvedValue([fakeCurrentRow])
    const updatedRow = { ...fakeCurrentRow, content: 'Updated!', version: 2 }
    tx.updateReturning.mockResolvedValue([updatedRow])

    const result = await updatePrompt(fakeCurrentRow.id, { content: 'Updated!' })

    expect(result).toEqual(updatedRow)
    expect(tx.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        promptId: fakeCurrentRow.id,
        content: 'Hello!',
        version: 1,
        action: 'updated',
      }),
    )
  })

  it('returns null and records no history when the prompt does not exist', async () => {
    const { db } = await import('../db/client')
    const { updatePrompt } = await import('./prompts')

    const tx = createFakeTx()
    ;(db.transaction as any).mockImplementation(async (cb: any) => cb(tx))
    tx.selectWhere.mockResolvedValue([])

    const result = await updatePrompt('00000000-0000-0000-0000-000000000000', { content: 'Updated!' })

    expect(result).toBeNull()
    expect(tx.insert).not.toHaveBeenCalled()
    expect(tx.update).not.toHaveBeenCalled()
  })
})

describe('deletePrompt', () => {
  it('deletes the row, snapshots it into prompt_history with action "deleted", and returns it', async () => {
    const { db } = await import('../db/client')
    const { deletePrompt } = await import('./prompts')

    const tx = createFakeTx()
    ;(db.transaction as any).mockImplementation(async (cb: any) => cb(tx))
    tx.deleteReturning.mockResolvedValue([fakeCurrentRow])

    const result = await deletePrompt(fakeCurrentRow.id)

    expect(result).toEqual(fakeCurrentRow)
    expect(tx.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        promptId: fakeCurrentRow.id,
        content: 'Hello!',
        version: 1,
        action: 'deleted',
      }),
    )
  })

  it('returns null and records no history when nothing was deleted', async () => {
    const { db } = await import('../db/client')
    const { deletePrompt } = await import('./prompts')

    const tx = createFakeTx()
    ;(db.transaction as any).mockImplementation(async (cb: any) => cb(tx))
    tx.deleteReturning.mockResolvedValue([])

    const result = await deletePrompt('00000000-0000-0000-0000-000000000000')

    expect(result).toBeNull()
    expect(tx.insert).not.toHaveBeenCalled()
  })
})

describe('listPromptHistory', () => {
  it("returns the prompt's history entries ordered oldest to newest", async () => {
    const { db } = await import('../db/client')
    const { listPromptHistory } = await import('./prompts')

    const entries = [
      { ...fakeCurrentRow, version: 1, action: 'updated' },
      { ...fakeCurrentRow, version: 2, action: 'deleted' },
    ]
    ;(db.select as any)().from().where().orderBy.mockResolvedValue(entries)

    const result = await listPromptHistory(fakeCurrentRow.id)

    expect(result).toEqual(entries)
  })
})
