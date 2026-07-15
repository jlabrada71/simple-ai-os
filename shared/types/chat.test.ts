import { describe, expect, it } from 'vitest'
import { chatRequestSchema } from './chat'

describe('chatRequestSchema', () => {
  it('accepts a valid text request', () => {
    const result = chatRequestSchema.parse({ type: 'text', text: 'hello' })
    expect(result).toEqual({ type: 'text', text: 'hello' })
  })

  it('rejects an empty text', () => {
    expect(() => chatRequestSchema.parse({ type: 'text', text: '' })).toThrow()
  })

  it('rejects a missing text', () => {
    expect(() => chatRequestSchema.parse({ type: 'text' })).toThrow()
  })

  it('accepts a valid prompt request with parameters', () => {
    const result = chatRequestSchema.parse({
      type: 'prompt',
      name: 'greeting',
      parameters: { name: 'Ada' },
    })
    expect(result).toEqual({ type: 'prompt', name: 'greeting', parameters: { name: 'Ada' } })
  })

  it('accepts a valid prompt request without parameters', () => {
    const result = chatRequestSchema.parse({ type: 'prompt', name: 'greeting' })
    expect(result).toEqual({ type: 'prompt', name: 'greeting' })
  })

  it('rejects a prompt request with an empty name', () => {
    expect(() => chatRequestSchema.parse({ type: 'prompt', name: '' })).toThrow()
  })

  it('rejects an unknown type', () => {
    expect(() => chatRequestSchema.parse({ type: 'other' })).toThrow()
  })

  it('rejects a request with no type', () => {
    expect(() => chatRequestSchema.parse({ text: 'hello' })).toThrow()
  })
})
