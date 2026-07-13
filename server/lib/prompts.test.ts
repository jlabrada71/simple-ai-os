import { describe, expect, it, vi } from 'vitest'
import { createPromptSchema, listPromptsQuerySchema, updatePromptSchema } from './prompts'

vi.mock('../db/client', () => {
  const returning = vi.fn()
  const values = vi.fn(() => ({ returning }))
  const insert = vi.fn(() => ({ values }))

  const deleteReturning = vi.fn()
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }))
  const del = vi.fn(() => ({ where: deleteWhere }))

  return { db: { insert, delete: del } }
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

describe('deletePrompt', () => {
  it('deletes the row and returns it', async () => {
    const { db } = await import('../db/client')
    const { deletePrompt } = await import('./prompts')

    const fakeRow = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'greeting',
      content: 'Hello!',
      description: null,
      tags: [],
      variables: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    ;(db.delete as any)().where().returning.mockResolvedValue([fakeRow])

    const result = await deletePrompt(fakeRow.id)

    expect(result).toEqual(fakeRow)
  })

  it('returns null when nothing was deleted', async () => {
    const { db } = await import('../db/client')
    const { deletePrompt } = await import('./prompts')

    ;(db.delete as any)().where().returning.mockResolvedValue([])

    const result = await deletePrompt('00000000-0000-0000-0000-000000000000')

    expect(result).toBeNull()
  })
})
