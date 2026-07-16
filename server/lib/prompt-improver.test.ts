import { describe, expect, it, vi } from 'vitest'

const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { create: createMock }
  }
  return { Anthropic }
})

const { improvePrompt, improvePromptRequestSchema } = await import('./prompt-improver')

describe('improvePromptRequestSchema', () => {
  it('requires non-empty content', () => {
    expect(() => improvePromptRequestSchema.parse({ content: '' })).toThrow()
  })

  it('accepts a minimal valid input', () => {
    const result = improvePromptRequestSchema.parse({ content: 'hello' })
    expect(result.content).toBe('hello')
  })
})

describe('improvePrompt', () => {
  it("replaces content with the agent's improved text and preserves other fields", async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'Improved version of the prompt.' }],
    })

    const result = await improvePrompt({
      name: 'greeting',
      content: 'say hi',
      description: 'a greeting prompt',
      tags: ['demo'],
      variables: [],
    })

    expect(result).toEqual({
      name: 'greeting',
      content: 'Improved version of the prompt.',
      description: 'a greeting prompt',
      tags: ['demo'],
      variables: [],
    })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'say hi' }],
      }),
    )
  })

  it('rejects a request with empty content', async () => {
    await expect(improvePrompt({ content: '' })).rejects.toThrow()
  })
})
