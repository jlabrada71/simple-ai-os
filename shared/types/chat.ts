import { z } from 'zod'

export const chatRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().trim().min(1) }),
  z.object({
    type: z.literal('prompt'),
    name: z.string().trim().min(1),
    parameters: z.record(z.string(), z.string()).optional(),
  }),
])

export type ChatRequest = z.infer<typeof chatRequestSchema>
