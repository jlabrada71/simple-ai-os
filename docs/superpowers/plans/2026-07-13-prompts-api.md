# Prompts CRUD API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Postgres-backed CRUD API (`/api/prompts`) for managing reusable prompt templates, with Docker-provisioned Postgres and vitest unit tests for validation logic.

**Architecture:** Drizzle ORM (query builder only, no migration runner) over a `pg` connection pool talks to a `prompts` table created by a plain SQL init script mounted into the Postgres container. Zod schemas validate all request input in `server/lib/prompts.ts`; four thin Nitro route handlers under `server/api/prompts/` call into that lib and map errors to HTTP status codes.

**Tech Stack:** `pg`, `drizzle-orm`, `zod`, `vitest` (new); existing Nuxt 4 / Nitro server, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-07-13-prompts-api-design.md`

---

### Task 1: Install dependencies and set up vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install runtime and dev dependencies**

Run:
```bash
npm install pg drizzle-orm zod
npm install -D vitest @types/pg
```

- [ ] **Step 2: Add the `test` script to `package.json`**

In `package.json`, add to `"scripts"`:
```json
    "test": "vitest run"
```
So the `scripts` block reads:
```json
  "scripts": {
    "build": "nuxt build",
    "dev": "nuxt dev",
    "generate": "nuxt generate",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create `vitest.config.ts` at the project root**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Verify vitest runs (no tests yet)**

Run: `npm test`
Expected: `No test files found` (non-zero exit is fine at this point — there are no test files yet). This just confirms vitest itself is wired up and the config loads without error.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add pg, drizzle-orm, zod, vitest dependencies"
```

---

### Task 2: Add Postgres env vars to `.env` / `.env.example`

**Files:**
- Modify: `.env`
- Create: `.env.example`

- [ ] **Step 1: Add DB vars to `.env`** (this file is gitignored, so edit it directly — no commit needed for this step)

Append to `.env`:
```
POSTGRES_DB=simple-ai-os
POSTGRES_USER=simple_ai_os
POSTGRES_PASSWORD=simple_ai_os
DATABASE_URL=postgres://simple_ai_os:simple_ai_os@postgres:5432/simple-ai-os
```

- [ ] **Step 2: Create `.env.example`**

```
ANTHROPIC_API_KEY=
POSTGRES_DB=simple-ai-os
POSTGRES_USER=simple_ai_os
POSTGRES_PASSWORD=simple_ai_os
DATABASE_URL=postgres://simple_ai_os:simple_ai_os@postgres:5432/simple-ai-os
```

- [ ] **Step 3: Confirm `.gitignore` already allows `.env.example`**

Run: `grep -n "env" /mnt/data/sources/simple-ai-os/.gitignore`
Expected output includes `.env`, `.env.*`, and `!.env.example` — no changes needed.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example documenting Postgres connection vars"
```

---

### Task 3: Add Postgres service to Docker Compose

**Files:**
- Modify: `docker-compose.yml`
- Create: `docker/init.sql`

- [ ] **Step 1: Create `docker/init.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  variables TEXT[] NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Update `docker-compose.yml`** to add the `postgres` service, wire `depends_on` into `dev`/`prod`, and add the named volume

Replace the full file contents with:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    env_file:
      - .env
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    ports:
      - "5432:5432"

  dev:
    build:
      context: .
      target: dev
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      - postgres
    volumes:
      - .:/app
      - /app/node_modules
      - ./data:/app/data

  prod:
    build:
      context: .
      target: prod
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      - postgres
    volumes:
      - ./data:/app/data

volumes:
  pgdata:
```

- [ ] **Step 3: Start Postgres and verify the table was created**

Run: `docker compose up -d postgres && sleep 3 && docker compose exec postgres psql -U simple_ai_os -d simple-ai-os -c '\d prompts'`
Expected: a table description listing columns `id, name, content, description, tags, variables, version, created_at, updated_at`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml docker/init.sql
git commit -m "feat: add Postgres service to Docker Compose for prompts storage"
```

---

### Task 4: Drizzle schema and DB client

**Files:**
- Create: `server/db/schema.ts`
- Create: `server/db/client.ts`

- [ ] **Step 1: Create `server/db/schema.ts`**

```ts
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export type Prompt = typeof prompts.$inferSelect
export type NewPrompt = typeof prompts.$inferInsert
```

- [ ] **Step 2: Create `server/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const db = drizzle(pool)
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json` (or `npm run dev` briefly if the project has no standalone tsc entry point that resolves `.nuxt` references — either way, confirm no TypeScript errors are reported for the two new files)
Expected: no errors referencing `server/db/schema.ts` or `server/db/client.ts`.

- [ ] **Step 4: Commit**

```bash
git add server/db/schema.ts server/db/client.ts
git commit -m "feat: add Drizzle schema and DB client for prompts table"
```

---

### Task 5: Prompts validation schemas (TDD)

**Files:**
- Create: `server/lib/prompts.ts`
- Test: `server/lib/prompts.test.ts`

- [ ] **Step 1: Write the failing tests for the zod schemas**

Create `server/lib/prompts.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- server/lib/prompts.test.ts`
Expected: FAIL — `Cannot find module './prompts'` (the implementation file doesn't exist yet).

- [ ] **Step 3: Create `server/lib/prompts.ts` with just the schemas**

```ts
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
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test -- server/lib/prompts.test.ts`
Expected: PASS — all 12 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/lib/prompts.ts server/lib/prompts.test.ts
git commit -m "feat: add zod validation schemas for prompts API"
```

---

### Task 6: Prompts CRUD functions

**Files:**
- Modify: `server/lib/prompts.ts`
- Modify: `server/lib/prompts.test.ts`

- [ ] **Step 1: Write a failing test for `createPrompt`'s success path against a mocked DB**

Add to the top of `server/lib/prompts.test.ts` (above the existing `describe` blocks), and add a new `describe` block at the bottom:

```ts
import { vi } from 'vitest'

vi.mock('../db/client', () => {
  const returning = vi.fn()
  const values = vi.fn(() => ({ returning }))
  const insert = vi.fn(() => ({ values }))
  return { db: { insert } }
})
```

(this import + mock go at the very top of the file, before the other imports resolve `./prompts`)

Then append at the bottom of the file:
```ts
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
```

- [ ] **Step 2: Run the tests to confirm the new ones fail**

Run: `npm test -- server/lib/prompts.test.ts`
Expected: FAIL — `createPrompt` is not exported from `./prompts` yet.

- [ ] **Step 3: Add the CRUD functions to `server/lib/prompts.ts`**

Add these imports to the top of the file (alongside the existing `import { z } from 'zod'`):
```ts
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { prompts, type Prompt } from '../db/schema'
```

Append to the bottom of `server/lib/prompts.ts`:
```ts
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

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test -- server/lib/prompts.test.ts`
Expected: PASS — all tests green (the original 12 schema tests plus the 2 new `createPrompt` tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/prompts.ts server/lib/prompts.test.ts
git commit -m "feat: add prompts CRUD functions backed by Drizzle"
```

---

### Task 7: API route handlers

**Files:**
- Create: `server/api/prompts/index.get.ts`
- Create: `server/api/prompts/index.post.ts`
- Create: `server/api/prompts/[id].get.ts`
- Create: `server/api/prompts/[id].put.ts`

- [ ] **Step 1: Create `server/api/prompts/index.get.ts`**

```ts
import { ZodError } from 'zod'
import { listPrompts } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  try {
    return await listPrompts(query)
  } catch (err) {
    if (err instanceof ZodError) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid query parameters', data: err.issues })
    }
    throw err
  }
})
```

- [ ] **Step 2: Create `server/api/prompts/index.post.ts`**

```ts
import { ZodError } from 'zod'
import { createPrompt, isUniqueViolation } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  try {
    const prompt = await createPrompt(body)
    setResponseStatus(event, 201)
    return prompt
  } catch (err) {
    if (err instanceof ZodError) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid prompt body', data: err.issues })
    }
    if (isUniqueViolation(err)) {
      throw createError({ statusCode: 409, statusMessage: 'A prompt with this name already exists' })
    }
    throw err
  }
})
```

- [ ] **Step 3: Create `server/api/prompts/[id].get.ts`**

```ts
import { getPrompt } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const prompt = await getPrompt(id)
  if (!prompt) {
    throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })
  }
  return prompt
})
```

- [ ] **Step 4: Create `server/api/prompts/[id].put.ts`**

```ts
import { ZodError } from 'zod'
import { isUniqueViolation, updatePrompt } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  try {
    const prompt = await updatePrompt(id, body)
    if (!prompt) {
      throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })
    }
    return prompt
  } catch (err) {
    if (err instanceof ZodError) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid prompt body', data: err.issues })
    }
    if (isUniqueViolation(err)) {
      throw createError({ statusCode: 409, statusMessage: 'A prompt with this name already exists' })
    }
    throw err
  }
})
```

- [ ] **Step 5: Run the full unit test suite**

Run: `npm test`
Expected: PASS — all `server/lib/prompts.test.ts` tests green (route handlers have no dedicated tests per the spec, since they contain no branching logic beyond error mapping).

- [ ] **Step 6: Commit**

```bash
git add server/api/prompts
git commit -m "feat: add prompts CRUD API routes"
```

---

### Task 8: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Rebuild and start the dev stack with Postgres**

Run: `docker compose up -d --build postgres dev`

- [ ] **Step 2: Wait for the app to be ready**

Run: `sleep 5 && curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000`
Expected: `200`

- [ ] **Step 3: Create a prompt**

Run:
```bash
curl -s -X POST http://localhost:3000/api/prompts \
  -H 'content-type: application/json' \
  -d '{"name":"greeting","content":"Hello, {{name}}!","tags":["demo"],"variables":["name"]}' | tee /tmp/create-response.json
```
Expected: JSON body with `"name":"greeting"`, `"version":1`, and a generated `"id"`. Save the `id` for the next steps.

- [ ] **Step 4: List prompts and confirm the new row appears**

Run: `curl -s 'http://localhost:3000/api/prompts?tag=demo'`
Expected: `{"prompts":[{...,"name":"greeting",...}],"limit":20,"offset":0}`

- [ ] **Step 5: Get the prompt by id**

Run: `ID=$(jq -r .id /tmp/create-response.json); curl -s "http://localhost:3000/api/prompts/$ID"`
Expected: the same row returned in step 3.

- [ ] **Step 6: Update the prompt and confirm version increments**

Run: `curl -s -X PUT "http://localhost:3000/api/prompts/$ID" -H 'content-type: application/json' -d '{"content":"Hi, {{name}}!"}'`
Expected: `"content":"Hi, {{name}}!"` and `"version":2`.

- [ ] **Step 7: Confirm duplicate name returns 409**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/prompts -H 'content-type: application/json' -d '{"name":"greeting","content":"dup"}'`
Expected: `409`

- [ ] **Step 8: Confirm invalid body returns 400**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/prompts -H 'content-type: application/json' -d '{"name":""}'`
Expected: `400`

- [ ] **Step 9: Confirm missing id returns 404**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/prompts/00000000-0000-0000-0000-000000000000`
Expected: `404`

- [ ] **Step 10: Tear down**

Run: `docker compose down`

---

## Self-Review Notes

- **Spec coverage:** schema (Task 3/4), dependencies (Task 1), all four endpoints (Task 7), error handling 400/404/409 (Tasks 6-7, verified in Task 8), Docker env-var wiring (Task 2/3), vitest setup and validation-focused tests (Tasks 1/5/6), out-of-scope items (auth, UI, DELETE, agent wiring, integration tests) correctly excluded.
- **Type consistency:** `Prompt`/`NewPrompt` types from `server/db/schema.ts` are the single source of truth, imported (not redefined) in `server/lib/prompts.ts`. Function names (`listPrompts`, `createPrompt`, `getPrompt`, `updatePrompt`, `isUniqueViolation`) are consistent between Task 6's implementation and Task 7's route handlers.
- **No placeholders:** all steps contain complete, runnable code.
