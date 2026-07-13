import { describe, expect, it } from 'vitest'
import { createPromptSchema, listPromptsQuerySchema, updatePromptSchema } from './prompts'

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
