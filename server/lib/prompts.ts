import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { prompts, type Prompt } from '../db/schema'

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

export async function listPrompts(
  rawQuery: unknown,
): Promise<{ prompts: Prompt[]; limit: number; offset: number }> {
  const { limit, offset, tag } = listPromptsQuerySchema.parse(rawQuery)

  const rows = tag
    ? await db
        .select()
        .from(prompts)
        .where(sql`${prompts.tags} @> ARRAY[${tag}]::text[]`)
        .orderBy(desc(prompts.createdAt))
        .limit(limit)
        .offset(offset)
    : await db.select().from(prompts).orderBy(desc(prompts.createdAt)).limit(limit).offset(offset)

  return { prompts: rows, limit, offset }
}

export async function createPrompt(rawInput: unknown): Promise<Prompt> {
  const input = createPromptSchema.parse(rawInput)

  const [row] = await db
    .insert(prompts)
    .values({
      name: input.name,
      content: input.content,
      description: input.description,
      tags: input.tags ?? [],
      variables: input.variables ?? [],
    })
    .returning()

  return row
}

export async function getPrompt(id: string): Promise<Prompt | null> {
  const [row] = await db.select().from(prompts).where(eq(prompts.id, id))
  return row ?? null
}

export async function updatePrompt(id: string, rawInput: unknown): Promise<Prompt | null> {
  const input = updatePromptSchema.parse(rawInput)

  const [row] = await db
    .update(prompts)
    .set({ ...input, version: sql`${prompts.version} + 1`, updatedAt: sql`now()` })
    .where(eq(prompts.id, id))
    .returning()

  return row ?? null
}

function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const code = (err as { code?: string }).code
  if (code) return code
  return pgErrorCode((err as { cause?: unknown }).cause)
}

export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23505'
}

export async function deletePrompt(id: string): Promise<Prompt | null> {
  const [row] = await db.delete(prompts).where(eq(prompts.id, id)).returning()
  return row ?? null
}
