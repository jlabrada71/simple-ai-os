import { Anthropic } from '@anthropic-ai/sdk'
import { z } from 'zod'
import { agents, getAgent } from './agents'

const systemAgent = getAgent(agents, 'prompt-improver')

const client = new Anthropic({
  apiKey: process.env['ANTHROPIC_API_KEY'],
})

export const improvePromptRequestSchema = z.object({
  name: z.string().trim().optional(),
  content: z.string().trim().min(1, 'content is required'),
  description: z.string().trim().optional(),
  tags: z.array(z.string()).optional(),
  variables: z.array(z.string()).optional(),
})

export type ImprovePromptInput = z.infer<typeof improvePromptRequestSchema>

export async function improvePromptContent(content: string): Promise<string> {
  const responseMessage = await client.messages.create({
    max_tokens: 1024,
    model: 'claude-sonnet-5',
    system: systemAgent.systemPrompt,
    messages: [{ role: 'user', content }],
  })

  return responseMessage.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim()
}

export async function improvePrompt(rawInput: unknown): Promise<ImprovePromptInput> {
  const input = improvePromptRequestSchema.parse(rawInput)
  const improvedContent = await improvePromptContent(input.content)
  return { ...input, content: improvedContent }
}
