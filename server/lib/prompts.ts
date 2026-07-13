import { z } from 'zod'

export const createPromptSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  content: z.string().trim().min(1, 'content is required'),
  description: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  variables: z.array(z.string().trim().min(1)).optional(),
})

export type CreatePromptInput = z.infer<typeof createPromptSchema>

export const updatePromptSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    variables: z.array(z.string().trim().min(1)).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'at least one field must be provided',
  })

export type UpdatePromptInput = z.infer<typeof updatePromptSchema>

export const listPromptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  tag: z.string().trim().min(1).optional(),
})

export type ListPromptsQuery = z.infer<typeof listPromptsQuerySchema>
