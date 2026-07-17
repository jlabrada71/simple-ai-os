import { sql } from 'drizzle-orm'
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const prompts = pgTable('prompts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull().unique(),
  content: text('content').notNull(),
  description: text('description'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  variables: text('variables').array().notNull().default(sql`'{}'::text[]`),
  version: integer('version').notNull().default(1),
  score: integer('score').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export type Prompt = typeof prompts.$inferSelect
export type NewPrompt = typeof prompts.$inferInsert

export const promptHistory = pgTable('prompt_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  promptId: uuid('prompt_id').notNull(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  description: text('description'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  variables: text('variables').array().notNull().default(sql`'{}'::text[]`),
  version: integer('version').notNull(),
  score: integer('score').notNull().default(0),
  action: text('action').notNull().$type<'updated' | 'deleted'>(),
  promptCreatedAt: timestamp('prompt_created_at', { withTimezone: true }).notNull(),
  promptUpdatedAt: timestamp('prompt_updated_at', { withTimezone: true }).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export type PromptHistoryEntry = typeof promptHistory.$inferSelect
export type NewPromptHistoryEntry = typeof promptHistory.$inferInsert
