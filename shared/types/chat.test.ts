import { describe, expect, it } from 'vitest'
import { chatRequestSchema } from './chat'

const threadId = '11111111-1111-4111-8111-111111111111'

describe('chatRequestSchema', () => {
  it('accepts a valid text request', () => {
    const result = chatRequestSchema.parse({ type: 'text', text: 'hello', threadId })
    expect(result).toEqual({ type: 'text', text: 'hello', threadId })
  })

  it('rejects an empty text', () => {
    expect(() => chatRequestSchema.parse({ type: 'text', text: '', threadId })).toThrow()
  })

  it('rejects a missing text', () => {
    expect(() => chatRequestSchema.parse({ type: 'text', threadId })).toThrow()
  })

  it('rejects a missing threadId', () => {
    expect(() => chatRequestSchema.parse({ type: 'text', text: 'hello' })).toThrow()
  })

  it('rejects a non-uuid threadId', () => {
    expect(() => chatRequestSchema.parse({ type: 'text', text: 'hello', threadId: 'not-a-uuid' })).toThrow()
  })

  it('accepts a valid prompt request with parameters', () => {
    const result = chatRequestSchema.parse({
      type: 'prompt',
      name: 'greeting',
      parameters: { name: 'Ada' },
      threadId,
    })
    expect(result).toEqual({ type: 'prompt', name: 'greeting', parameters: { name: 'Ada' }, threadId })
  })

  it('accepts a valid prompt request without parameters', () => {
    const result = chatRequestSchema.parse({ type: 'prompt', name: 'greeting', threadId })
    expect(result).toEqual({ type: 'prompt', name: 'greeting', threadId })
  })

  it('rejects a prompt request with an empty name', () => {
    expect(() => chatRequestSchema.parse({ type: 'prompt', name: '', threadId })).toThrow()
  })

  it('rejects a prompt request with a missing threadId', () => {
    expect(() => chatRequestSchema.parse({ type: 'prompt', name: 'greeting' })).toThrow()
  })

  it('rejects an unknown type', () => {
    expect(() => chatRequestSchema.parse({ type: 'other', threadId })).toThrow()
  })

  it('rejects a request with no type', () => {
    expect(() => chatRequestSchema.parse({ text: 'hello', threadId })).toThrow()
  })
})
