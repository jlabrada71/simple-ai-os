# DB-Backed Threads + Per-User API Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fs-backed chat session store with tenant-schema `threads`/`messages` tables (multi-thread, switchable, per-user), and let every tenant-scoped REST endpoint also accept a per-user API key as an alternative to the session cookie.

**Architecture:** Two new tenant-schema tables (`threads`, `messages`) plus a `server/lib/threads.ts` module own thread/message persistence. `server/lib/agent.ts`/`agent-streaming.ts` load history from and append to these tables instead of `unstorage`. `requireTenantSession` is extended in place to also accept `Authorization: Bearer <token>`, resolving through a new `apiKeys` table. `chat-streaming.vue` gets a thread list/switcher backed by a new `useThreads()` composable; `chat.vue` is unaffected visually (its endpoint auto-resolves the user's latest thread).

**Tech Stack:** Nuxt 4/Nitro, Drizzle ORM, Postgres 18, Vitest, `node:crypto` (token generation/hashing).

**Spec:** `docs/superpowers/specs/2026-08-20-db-backed-threads-design.md`

---

## File structure

| File | Responsibility |
|---|---|
| `server/db/schema/tenant.ts` | add `threads`, `messages`, `apiKeys` tables (modified) |
| `server/lib/threads.ts` | thread/message persistence functions (new) |
| `server/lib/apiKeys.ts` | API key generation/hashing/CRUD functions (new) |
| `server/utils/requireTenantSession.ts` | add bearer-token resolution before the session-cookie fallback (modified) |
| `shared/types/chat.ts` | add `threadId` to `chatRequestSchema` (modified) |
| `server/lib/agent.ts`, `server/lib/agent-streaming.ts` | load/persist via `server/lib/threads.ts` instead of `unstorage` (modified) |
| `server/api/agent.post.ts` | resolves the caller's latest thread automatically (modified) |
| `server/api/agent-stream.post.ts` | requires and validates ownership of `threadId` (modified) |
| `server/api/new-thread.ts` | **deleted** — superseded by `POST /api/threads` |
| `server/api/threads/index.get.ts`, `index.post.ts` | list / create threads (new) |
| `server/api/threads/[id]/messages.get.ts` | fetch one thread's messages (new) |
| `server/api/api-keys/index.get.ts`, `index.post.ts`, `[id].delete.ts` | API key management (new) |
| `nuxt.config.ts` | remove the `nitro.storage.session` fs driver (modified) |
| `app/composables/useThreads.ts` | thread list/switch/create state for the frontend (new) |
| `app/pages/chat-streaming.vue` | add the thread sidebar (modified) |
| `app/pages/chat.vue` | swap `/api/new-thread` for `POST /api/threads` (modified) |

---

## Task 1: Schema + migration

**Files:**
- Modify: `server/db/schema/tenant.ts`
- Create: `server/db/migrations/tenant/0001_*.sql` (generated)

- [ ] **Step 1: Add the three tables to `server/db/schema/tenant.ts`**, appending after the existing `tenantConfig` export:

```ts
export const threads = pgTable('threads', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id),
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export type Thread = typeof threads.$inferSelect
export type NewThread = typeof threads.$inferInsert

export const threadMessages = pgTable('messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  threadId: uuid('thread_id').notNull().references(() => threads.id),
  role: text('role').notNull().$type<'user' | 'assistant'>(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export type ThreadMessage = typeof threadMessages.$inferSelect
export type NewThreadMessage = typeof threadMessages.$inferInsert

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name'),
  keyHash: text('key_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
})

export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert
```

(`threadMessages` — not `messages` — is the export name, to avoid colliding with the `messages`
array variable name already used throughout `server/lib/agent*.ts`.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate:tenant`
Expected: a new `server/db/migrations/tenant/0001_*.sql` creating `threads`, `messages`, and
`api_keys`, each with a foreign key to `users`/`threads` as appropriate.

- [ ] **Step 3: Run the full unit suite** (schema-only change, nothing should break)

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/db/schema/tenant.ts server/db/migrations/tenant
git commit -m "feat: add threads, messages, and api_keys tables"
```

---

## Task 2: `server/lib/threads.ts`

**Files:**
- Create: `server/lib/threads.ts`
- Test: `server/lib/threads.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/lib/threads.test.ts
import { describe, expect, it, vi } from 'vitest'

function createFakeDb() {
  const selectLimit = vi.fn()
  const selectOrderBy = vi.fn()
  const selectWhereForOrderBy = vi.fn(() => ({ orderBy: selectOrderBy }))
  const selectWhereForLimit = vi.fn(() => ({ limit: selectLimit }))
  const selectFrom = vi.fn((_table: unknown) => ({
    where: (..._args: unknown[]) => ({ limit: selectLimit, orderBy: selectOrderBy }),
    orderBy: selectOrderBy,
  }))
  const select = vi.fn(() => ({ from: selectFrom }))

  const insertReturning = vi.fn()
  const insertValues = vi.fn(() => ({ returning: insertReturning }))
  const insert = vi.fn(() => ({ values: insertValues }))

  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))

  const transaction = vi.fn()

  return { select, selectFrom, selectLimit, selectOrderBy, insert, insertValues, insertReturning, update, updateSet, updateWhere, transaction } as any
}

describe('createThread', () => {
  it('inserts a thread row with a null title for the given user', async () => {
    const db = createFakeDb()
    db.insertReturning.mockResolvedValue([{ id: 't1', userId: 'u1', title: null, createdAt: new Date(), updatedAt: new Date() }])

    const { createThread } = await import('./threads')
    const result = await createThread(db, 'u1')

    expect(db.insertValues).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }))
    expect(result.id).toBe('t1')
  })
})

describe('listThreads', () => {
  it('returns the users threads ordered by updatedAt descending', async () => {
    const db = createFakeDb()
    const rows = [{ id: 't2', title: 'b' }, { id: 't1', title: 'a' }]
    db.selectOrderBy.mockResolvedValue(rows)

    const { listThreads } = await import('./threads')
    const result = await listThreads(db, 'u1')

    expect(result).toEqual(rows)
  })
})

describe('getThreadForUser', () => {
  it('returns null when no thread matches (wrong id or wrong owner)', async () => {
    const db = createFakeDb()
    db.selectLimit.mockResolvedValue([])

    const { getThreadForUser } = await import('./threads')
    expect(await getThreadForUser(db, 't1', 'u1')).toBeNull()
  })

  it('returns the thread when it belongs to the given user', async () => {
    const db = createFakeDb()
    const thread = { id: 't1', userId: 'u1' }
    db.selectLimit.mockResolvedValue([thread])

    const { getThreadForUser } = await import('./threads')
    expect(await getThreadForUser(db, 't1', 'u1')).toEqual(thread)
  })
})

describe('getOrCreateLatestThread', () => {
  it('returns the most recently updated existing thread without creating a new one', async () => {
    const db = createFakeDb()
    const existing = { id: 't1', userId: 'u1', title: 'hi' }
    db.selectLimit.mockResolvedValue([existing])

    const { getOrCreateLatestThread } = await import('./threads')
    const result = await getOrCreateLatestThread(db, 'u1')

    expect(result).toEqual(existing)
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('creates a new thread when the user has none yet', async () => {
    const db = createFakeDb()
    db.selectLimit.mockResolvedValue([])
    const created = { id: 't1', userId: 'u1', title: null }
    db.insertReturning.mockResolvedValue([created])

    const { getOrCreateLatestThread } = await import('./threads')
    const result = await getOrCreateLatestThread(db, 'u1')

    expect(result).toEqual(created)
  })
})

describe('getThreadMessages', () => {
  it('returns a threads messages ordered oldest first', async () => {
    const db = createFakeDb()
    const rows = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]
    db.selectOrderBy.mockResolvedValue(rows)

    const { getThreadMessages } = await import('./threads')
    expect(await getThreadMessages(db, 't1')).toEqual(rows)
  })
})

describe('recordExchange', () => {
  it('inserts a user+assistant message pair, sets the title from the user message on first exchange, and bumps updatedAt', async () => {
    const db = createFakeDb()
    const tx = createFakeDb()
    db.transaction.mockImplementation(async (cb: any) => cb(tx))
    tx.selectLimit.mockResolvedValue([{ id: 't1', title: null }])

    const { recordExchange } = await import('./threads')
    await recordExchange(db, 't1', 'hello there, how are you?', 'I am fine')

    expect(tx.insertValues).toHaveBeenCalledWith(expect.objectContaining({ threadId: 't1', role: 'user', content: 'hello there, how are you?' }))
    expect(tx.insertValues).toHaveBeenCalledWith(expect.objectContaining({ threadId: 't1', role: 'assistant', content: 'I am fine' }))
    expect(tx.updateSet).toHaveBeenCalledWith(expect.objectContaining({ title: 'hello there, how are you?' }))
  })

  it('does not overwrite an existing title on later exchanges', async () => {
    const db = createFakeDb()
    const tx = createFakeDb()
    db.transaction.mockImplementation(async (cb: any) => cb(tx))
    tx.selectLimit.mockResolvedValue([{ id: 't1', title: 'existing title' }])

    const { recordExchange } = await import('./threads')
    await recordExchange(db, 't1', 'another message', 'another reply')

    expect(tx.updateSet).toHaveBeenCalledWith(expect.objectContaining({ title: 'existing title' }))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/lib/threads.test.ts`
Expected: FAIL — `Cannot find module './threads'`

- [ ] **Step 3: Create `server/lib/threads.ts`**

```ts
import { desc, eq, sql } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { threads, threadMessages, type Thread, type ThreadMessage } from '../db/schema/tenant'

type Db = ReturnType<typeof drizzle>

const TITLE_MAX_LENGTH = 50

function deriveTitle(userMessage: string): string {
  const trimmed = userMessage.trim()
  return trimmed.length > TITLE_MAX_LENGTH ? `${trimmed.slice(0, TITLE_MAX_LENGTH)}…` : trimmed
}

export async function createThread(db: Db, userId: string): Promise<Thread> {
  const [thread] = await db.insert(threads).values({ userId }).returning()
  return thread
}

export async function listThreads(db: Db, userId: string): Promise<Thread[]> {
  return db.select().from(threads).where(eq(threads.userId, userId)).orderBy(desc(threads.updatedAt))
}

export async function getThreadForUser(db: Db, threadId: string, userId: string): Promise<Thread | null> {
  const [thread] = await db
    .select()
    .from(threads)
    .where(sql`${threads.id} = ${threadId} and ${threads.userId} = ${userId}`)
    .limit(1)
  return thread ?? null
}

export async function getOrCreateLatestThread(db: Db, userId: string): Promise<Thread> {
  const [latest] = await db
    .select()
    .from(threads)
    .where(eq(threads.userId, userId))
    .orderBy(desc(threads.updatedAt))
    .limit(1)
  if (latest) return latest
  return createThread(db, userId)
}

export async function getThreadMessages(db: Db, threadId: string): Promise<ThreadMessage[]> {
  return db.select().from(threadMessages).where(eq(threadMessages.threadId, threadId)).orderBy(threadMessages.createdAt)
}

export async function recordExchange(
  db: Db,
  threadId: string,
  userContent: string,
  assistantContent: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [thread] = await tx.select().from(threads).where(eq(threads.id, threadId)).limit(1)

    await tx.insert(threadMessages).values({ threadId, role: 'user', content: userContent })
    await tx.insert(threadMessages).values({ threadId, role: 'assistant', content: assistantContent })

    await tx
      .update(threads)
      .set({
        title: thread?.title ?? deriveTitle(userContent),
        updatedAt: sql`now()`,
      })
      .where(eq(threads.id, threadId))
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/lib/threads.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/lib/threads.ts server/lib/threads.test.ts
git commit -m "feat: add thread and message persistence functions"
```

---

## Task 3: `chatRequestSchema` gains `threadId`

**Files:**
- Modify: `shared/types/chat.ts`
- Modify: `shared/types/chat.test.ts` (existing file — extend, don't replace)

- [ ] **Step 1: Read `shared/types/chat.test.ts`** to see its current cases, then add a case
  asserting `threadId` is required and must be a UUID (follow that file's existing style exactly —
  read it first rather than guessing its conventions).

- [ ] **Step 2: Run the existing test file to confirm current behavior, then update `shared/types/chat.ts`**

```ts
import { z } from 'zod'

export const chatRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().trim().min(1), threadId: z.string().uuid() }),
  z.object({
    type: z.literal('prompt'),
    name: z.string().trim().min(1),
    parameters: z.record(z.string(), z.string()).optional(),
    threadId: z.string().uuid(),
  }),
])

export type ChatRequest = z.infer<typeof chatRequestSchema>
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx vitest run shared/types/chat.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add shared/types/chat.ts shared/types/chat.test.ts
git commit -m "feat: require threadId on chat requests"
```

---

## Task 4: `server/lib/agent.ts` and `agent-streaming.ts` use DB threads

**Files:**
- Modify: `server/lib/agent.ts`
- Modify: `server/lib/agent-streaming.ts`

- [ ] **Step 1: Rewrite `server/lib/agent.ts`**

```ts
import { Anthropic } from "@anthropic-ai/sdk";
import type { drizzle } from "drizzle-orm/node-postgres";
import { agents, getAgent } from './agents';
import { getThreadMessages, recordExchange } from './threads';

const systemAgent = getAgent(agents, 'orchestrator');

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"]
});

type Message = { role: "user" | "assistant"; content: string };

export async function chat(db: ReturnType<typeof drizzle>, threadId: string, userMessage: string): Promise<string> {
    const history = await getThreadMessages(db, threadId)
    const messages: Message[] = history.map((m) => ({ role: m.role, content: m.content }))
    messages.push({ role: "user", content: userMessage })

    const responseMessage = await client.messages.create({
        max_tokens: 10000,
        messages,
        model: "claude-sonnet-5",
        system: systemAgent.systemPrompt
    });

    const responseText = responseMessage.content.map(block => {
        if (block.type === "text") {
            return block.text;
        }
        return '';
    }).join('\n');

    await recordExchange(db, threadId, userMessage, responseText)

    return responseText;
}
```

- [ ] **Step 2: Rewrite `server/lib/agent-streaming.ts`**

```ts
import { Anthropic } from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { drizzle } from "drizzle-orm/node-postgres";
import { createMcpServer } from "../mcp/server";
import { type ChatRequest } from "../../shared/types/chat";
import { agents, getAgent } from './agents';
import { getThreadMessages, recordExchange } from './threads';

const systemAgent = getAgent(agents, 'orchestrator');

const client = new Anthropic({
    baseURL: process.env['AGENT_BASE_URL'],
    apiKey: process.env["ANTHROPIC_API_KEY"]
});

type Message = { role: "user" | "assistant"; content: string };

async function resolvePromptText(db: ReturnType<typeof drizzle>, name: string, parameters?: Record<string, string>): Promise<string> {
    const server = await createMcpServer(db);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "agent-streaming", version: "1.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.getPrompt({ name, arguments: parameters });
    const [firstMessage] = result.messages;
    if (!firstMessage) {
        throw new Error(`Prompt "${name}" returned no messages`);
    }
    const text = (firstMessage.content as { type: "text"; text: string }).text;

    await client.close();
    await server.close();

    return text;
}

export function chat(db: ReturnType<typeof drizzle>, threadId: string, request: ChatRequest): ReadableStream<string> {
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            let content = '';

            const history = await getThreadMessages(db, threadId)
            const messages: Message[] = history.map((m) => ({ role: m.role, content: m.content }))

            const userMessageText = request.type === "text"
                ? request.text
                : await resolvePromptText(db, request.name, request.parameters);

            messages.push({ role: "user", content: userMessageText })

            const claudeStream = await client.messages.create({
                max_tokens: 10000,
                messages,
                model: "claude-sonnet-5",
                system: systemAgent.systemPrompt,
                stream: true,
            });
            for await (const messageStreamEvent of claudeStream) {
                if (messageStreamEvent.type === "content_block_delta") {
                    if (messageStreamEvent.delta.type === "text_delta") {
                        const textChunk = messageStreamEvent.delta.text;
                        content += textChunk;
                        controller.enqueue(encoder.encode(textChunk));
                    }
                }
            }

            await recordExchange(db, threadId, userMessageText, content)

            controller.close();
        }
    });
    return stream;
}
```

- [ ] **Step 3: Run the full unit suite and fix any now-broken call sites** (there are none in
  `server/lib/*.test.ts` today that call `chat()` directly, but re-check)

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/lib/agent.ts server/lib/agent-streaming.ts
git commit -m "feat: load and persist chat history via DB threads instead of fs sessions"
```

---

## Task 5: Route handlers use threads; delete `new-thread.ts`

**Files:**
- Modify: `server/api/agent.post.ts`
- Modify: `server/api/agent-stream.post.ts`
- Delete: `server/api/new-thread.ts`

- [ ] **Step 1: Rewrite `server/api/agent.post.ts`**

```ts
import { withTenantDb } from '../db/client'
import { requireTenantSession } from '../utils/requireTenantSession'
import { chat } from '../lib/agent'
import { getOrCreateLatestThread } from '../lib/threads'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { tenant, user } = await requireTenantSession(event)

    const response = await withTenantDb(tenant.schemaName, async (db) => {
        const thread = await getOrCreateLatestThread(db, user.id)
        return chat(db, thread.id, body.value)
    })

    return response
})
```

- [ ] **Step 2: Rewrite `server/api/agent-stream.post.ts`**

```ts
import { withTenantDb } from '../db/client'
import { requireTenantSession } from '../utils/requireTenantSession'
import { chat } from '../lib/agent-streaming'
import { chatRequestSchema } from '../../shared/types/chat'
import { getThreadForUser } from '../lib/threads'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const request = chatRequestSchema.parse(body)
    const { tenant, user } = await requireTenantSession(event)

    const stream = await withTenantDb(tenant.schemaName, async (db) => {
        const thread = await getThreadForUser(db, request.threadId, user.id)
        if (!thread) {
            throw createError({ statusCode: 404, statusMessage: 'Thread not found' })
        }
        return chat(db, thread.id, request)
    })

    return sendStream(event, stream)
})
```

- [ ] **Step 3: Delete `server/api/new-thread.ts`**

```bash
git rm server/api/new-thread.ts
```

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/api/agent.post.ts server/api/agent-stream.post.ts
git commit -m "feat: resolve and validate threads in chat route handlers, remove new-thread stub"
```

---

## Task 6: `server/api/threads/**` endpoints

**Files:**
- Create: `server/api/threads/index.get.ts`
- Create: `server/api/threads/index.post.ts`
- Create: `server/api/threads/[id]/messages.get.ts`

- [ ] **Step 1: Create `server/api/threads/index.get.ts`**

```ts
import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { listThreads } from '../../lib/threads'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  const threads = await withTenantDb(tenant.schemaName, (db) => listThreads(db, user.id))
  return { threads }
})
```

- [ ] **Step 2: Create `server/api/threads/index.post.ts`**

```ts
import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { createThread } from '../../lib/threads'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  const thread = await withTenantDb(tenant.schemaName, (db) => createThread(db, user.id))
  setResponseStatus(event, 201)
  return thread
})
```

- [ ] **Step 3: Create `server/api/threads/[id]/messages.get.ts`**

```ts
import { withTenantDb } from '../../../db/client'
import { requireTenantSession } from '../../../utils/requireTenantSession'
import { getThreadForUser, getThreadMessages } from '../../../lib/threads'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  const id = getRouterParam(event, 'id')!

  const messages = await withTenantDb(tenant.schemaName, async (db) => {
    const thread = await getThreadForUser(db, id, user.id)
    if (!thread) return null
    return getThreadMessages(db, id)
  })

  if (messages === null) {
    throw createError({ statusCode: 404, statusMessage: 'Thread not found' })
  }

  return { messages }
})
```

- [ ] **Step 4: Verify the app still boots and typechecks via `nuxt prepare`**

Run: `npx nuxt prepare`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add server/api/threads
git commit -m "feat: add thread list/create/messages endpoints"
```

---

## Task 7: `requireTenantSession` accepts a bearer API key

**Files:**
- Modify: `server/utils/requireTenantSession.ts`
- Modify: `server/utils/requireTenantSession.test.ts`

- [ ] **Step 1: Rewrite the test file** — the existing fixture builds bare `{ context: {...} }`
  events with no `node.req.headers`, which the new bearer-header check would crash on; every
  fixture needs a `node.req.headers` object now (matching the real shape `h3`'s `getHeader`
  expects, same as `server/utils/adminApiAuth.test.ts` already does), and new cases cover the
  API-key path:

```ts
// server/utils/requireTenantSession.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const getIamSessionMock = vi.fn()
vi.stubGlobal('getIamSession', getIamSessionMock)

const selectResult = vi.fn()
const apiKeySelectResult = vi.fn()
const insertReturning = vi.fn()
const updateWhereMock = vi.fn().mockResolvedValue(undefined)

vi.mock('../db/client', () => ({
  withTenantDb: async (_schema: string, fn: (db: unknown) => unknown) =>
    fn({
      select: (fields?: unknown) =>
        fields
          ? { from: () => ({ innerJoin: () => ({ where: () => ({ limit: apiKeySelectResult }) }) }) }
          : { from: () => ({ where: () => ({ limit: selectResult }) }) },
      insert: () => ({ values: () => ({ returning: insertReturning }) }),
      update: () => ({ set: () => ({ where: updateWhereMock }) }),
    }),
}))

import { requireTenantSession } from './requireTenantSession'

function fakeEvent(tenant: unknown, headers: Record<string, string> = {}) {
  return { context: { tenant }, node: { req: { headers } } } as any
}

describe('requireTenantSession', () => {
  beforeEach(() => {
    getIamSessionMock.mockReset()
    selectResult.mockReset()
    apiKeySelectResult.mockReset()
    insertReturning.mockReset()
    updateWhereMock.mockClear()
  })

  it('throws 404 when no tenant was resolved', async () => {
    await expect(requireTenantSession(fakeEvent(null))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws 401 when there is no bearer token and no iam session', async () => {
    getIamSessionMock.mockResolvedValue(null)
    await expect(requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('auto-creates a tenant user with role member on first login (session path)', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    selectResult.mockResolvedValue([])
    insertReturning.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))
    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
    expect(result.via).toBe('session')
  })

  it('returns tenant + user when authenticated and a member (session path)', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    selectResult.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))
    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
    expect(result.via).toBe('session')
  })

  it('resolves via a valid bearer API key without calling getIamSession', async () => {
    apiKeySelectResult.mockResolvedValue([{ apiKey: { id: 'k1' }, user: { id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' } }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }, { authorization: 'Bearer sao_validtoken' }))
    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
    expect(result.via).toBe('apiKey')
    expect(updateWhereMock).toHaveBeenCalled()
    expect(getIamSessionMock).not.toHaveBeenCalled()
  })

  it('falls through to the session check when the bearer token does not match any key', async () => {
    apiKeySelectResult.mockResolvedValue([])
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    selectResult.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }, { authorization: 'Bearer sao_wrongtoken' }))
    expect(result.via).toBe('session')
  })
})
```

- [ ] **Step 2: Run it to verify the new cases fail**

Run: `npx vitest run server/utils/requireTenantSession.test.ts`
Expected: FAIL — `via` undefined, apiKey path not implemented

- [ ] **Step 3: Rewrite `server/utils/requireTenantSession.ts`**

```ts
import { eq, sql } from 'drizzle-orm'
import { createError, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { withTenantDb } from '../db/client'
import { users, apiKeys, type TenantUser } from '../db/schema/tenant'
import { sha256Hex } from './hash'
import type { TenantContext } from './tenant'

export interface TenantSession {
  tenant: TenantContext
  user: TenantUser
  via: 'session' | 'apiKey'
}

async function resolveViaApiKey(event: H3Event, tenant: TenantContext): Promise<TenantSession | null> {
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null

  return withTenantDb(tenant.schemaName, async (db) => {
    const keyHash = sha256Hex(token)
    const [row] = await db
      .select({ apiKey: apiKeys, user: users })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1)
    if (!row) return null

    await db.update(apiKeys).set({ lastUsedAt: sql`now()` }).where(eq(apiKeys.id, row.apiKey.id))

    return { tenant, user: row.user, via: 'apiKey' as const }
  })
}

export async function requireTenantSession(event: H3Event): Promise<TenantSession> {
  const tenant = event.context.tenant as TenantContext | null
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown tenant' })
  }

  const viaApiKey = await resolveViaApiKey(event, tenant)
  if (viaApiKey) return viaApiKey

  const session = await getIamSession(event, 'tenant')
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const user = await withTenantDb(tenant.schemaName, async (db) => {
    const [existing] = await db.select().from(users).where(eq(users.iamSub, session.username)).limit(1)
    if (existing) return existing

    const [created] = await db
      .insert(users)
      .values({ iamSub: session.username, email: session.email, role: 'member' })
      .returning()
    return created
  })

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  return { tenant, user, via: 'session' }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/utils/requireTenantSession.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full unit suite** (every other call site destructures `{ tenant, user }`
  from the return value, so the added `via` field is additive and shouldn't break anything, but
  confirm)

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/utils/requireTenantSession.ts server/utils/requireTenantSession.test.ts
git commit -m "feat: accept a per-user bearer API key as an alternative to the session cookie"
```

---

## Task 8: `server/lib/apiKeys.ts`

**Files:**
- Create: `server/lib/apiKeys.ts`
- Test: `server/lib/apiKeys.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/lib/apiKeys.test.ts
import { describe, expect, it, vi } from 'vitest'

function createFakeDb() {
  const insertReturning = vi.fn()
  const insertValues = vi.fn(() => ({ returning: insertReturning }))
  const insert = vi.fn(() => ({ values: insertValues }))

  const selectOrderBy = vi.fn()
  const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }))
  const selectFrom = vi.fn(() => ({ where: selectWhere }))
  const select = vi.fn(() => ({ from: selectFrom }))

  const deleteWhere = vi.fn().mockResolvedValue(undefined)
  const del = vi.fn(() => ({ where: deleteWhere }))

  return { insert, insertValues, insertReturning, select, selectFrom, selectWhere, selectOrderBy, delete: del, deleteWhere } as any
}

describe('createApiKey', () => {
  it('generates a sao_-prefixed token, stores only its hash, and returns the plaintext token once', async () => {
    const db = createFakeDb()
    db.insertReturning.mockResolvedValue([{ id: 'k1', userId: 'u1', name: 'my key', createdAt: new Date(), lastUsedAt: null }])

    const { createApiKey } = await import('./apiKeys')
    const result = await createApiKey(db, 'u1', 'my key')

    expect(result.token).toMatch(/^sao_/)
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', name: 'my key', keyHash: expect.not.stringMatching(result.token) }),
    )
    expect(result.token.length).toBeGreaterThan(20)
  })
})

describe('listApiKeys', () => {
  it("returns the user's keys without the hash or token", async () => {
    const db = createFakeDb()
    const rows = [{ id: 'k1', name: 'a', createdAt: new Date(), lastUsedAt: null }]
    db.selectOrderBy.mockResolvedValue(rows)

    const { listApiKeys } = await import('./apiKeys')
    expect(await listApiKeys(db, 'u1')).toEqual(rows)
  })
})

describe('deleteApiKey', () => {
  it('deletes only when the key belongs to the given user', async () => {
    const db = createFakeDb()

    const { deleteApiKey } = await import('./apiKeys')
    await deleteApiKey(db, 'k1', 'u1')

    expect(db.delete).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/lib/apiKeys.test.ts`
Expected: FAIL — `Cannot find module './apiKeys'`

- [ ] **Step 3: Create `server/lib/apiKeys.ts`**

```ts
import { randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { apiKeys } from '../db/schema/tenant'
import { sha256Hex } from '../utils/hash'

type Db = ReturnType<typeof drizzle>

export interface CreatedApiKey {
  id: string
  name: string | null
  token: string
  createdAt: Date
}

function generateToken(): string {
  return `sao_${randomBytes(32).toString('base64url')}`
}

export async function createApiKey(db: Db, userId: string, name?: string): Promise<CreatedApiKey> {
  const token = generateToken()
  const [row] = await db
    .insert(apiKeys)
    .values({ userId, name: name ?? null, keyHash: sha256Hex(token) })
    .returning()

  return { id: row.id, name: row.name, token, createdAt: row.createdAt }
}

export async function listApiKeys(db: Db, userId: string) {
  return db
    .select({ id: apiKeys.id, name: apiKeys.name, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt))
}

export async function deleteApiKey(db: Db, keyId: string, userId: string): Promise<void> {
  await db.delete(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/lib/apiKeys.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/lib/apiKeys.ts server/lib/apiKeys.test.ts
git commit -m "feat: add per-user API key generation, listing, and revocation"
```

---

## Task 9: `server/api/api-keys/**` endpoints

**Files:**
- Create: `server/api/api-keys/index.get.ts`
- Create: `server/api/api-keys/index.post.ts`
- Create: `server/api/api-keys/[id].delete.ts`

- [ ] **Step 1: Create `server/api/api-keys/index.post.ts`** — the one endpoint that refuses
  API-key auth (a leaked key must not be usable to mint itself replacements):

```ts
import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { createApiKey } from '../../lib/apiKeys'

interface CreateApiKeyBody {
  name?: string
}

export default defineEventHandler(async (event) => {
  const { tenant, user, via } = await requireTenantSession(event)
  if (via !== 'session') {
    throw createError({ statusCode: 401, statusMessage: 'API keys must be created with a browser session, not another API key' })
  }

  const body = await readBody<CreateApiKeyBody>(event)
  const created = await withTenantDb(tenant.schemaName, (db) => createApiKey(db, user.id, body?.name))

  setResponseStatus(event, 201)
  return created
})
```

- [ ] **Step 2: Create `server/api/api-keys/index.get.ts`**

```ts
import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { listApiKeys } from '../../lib/apiKeys'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  const apiKeys = await withTenantDb(tenant.schemaName, (db) => listApiKeys(db, user.id))
  return { apiKeys }
})
```

- [ ] **Step 3: Create `server/api/api-keys/[id].delete.ts`**

```ts
import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { deleteApiKey } from '../../lib/apiKeys'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  const id = getRouterParam(event, 'id')!
  await withTenantDb(tenant.schemaName, (db) => deleteApiKey(db, id, user.id))
  return { success: true }
})
```

- [ ] **Step 4: Verify the app still boots**

Run: `npx nuxt prepare`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add server/api/api-keys
git commit -m "feat: add API key management endpoints"
```

---

## Task 10: `nuxt.config.ts` cleanup

**Files:**
- Modify: `nuxt.config.ts`

- [ ] **Step 1: Remove the `nitro.storage.session` block**, leaving `serverAssets` and
  `routeRules` intact:

```ts
  nitro: {
    serverAssets: [
      { baseName: 'migrationsPublic', dir: fileURLToPath(new URL('./server/db/migrations/public', import.meta.url)) },
      { baseName: 'migrationsTenant', dir: fileURLToPath(new URL('./server/db/migrations/tenant', import.meta.url)) },
    ],
    routeRules: {
      '/mcp': { cors: true }
    }
  },
```

- [ ] **Step 2: Verify no remaining `useStorage('session')` references**

Run: `grep -rn "useStorage('session')" server/`
Expected: no output (Task 4 already removed all call sites — this just confirms)

- [ ] **Step 3: Run `nuxt prepare` and the full unit suite**

Run: `npx nuxt prepare && npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add nuxt.config.ts
git commit -m "chore: remove unused fs session storage config"
```

---

## Task 11: `useThreads()` composable + `chat-streaming.vue` sidebar

**Files:**
- Create: `app/composables/useThreads.ts`
- Modify: `app/pages/chat-streaming.vue`

- [ ] **Step 1: Create `app/composables/useThreads.ts`**

```ts
interface ThreadSummary {
  id: string
  title: string | null
  updatedAt: string
}

interface ThreadMessage {
  role: 'user' | 'assistant'
  content: string
}

export function useThreads() {
  const threads = useState<ThreadSummary[]>('threads-list', () => [])
  const activeThreadId = useState<string | null>('threads-active-id', () => null)

  async function refreshThreads() {
    const data = await $fetch<{ threads: ThreadSummary[] }>('/api/threads')
    threads.value = data.threads
  }

  async function ensureActiveThread(): Promise<string> {
    if (activeThreadId.value) return activeThreadId.value
    const created = await $fetch<{ id: string }>('/api/threads', { method: 'POST' })
    activeThreadId.value = created.id
    await refreshThreads()
    return created.id
  }

  async function selectThread(id: string): Promise<ThreadMessage[]> {
    const data = await $fetch<{ messages: ThreadMessage[] }>(`/api/threads/${id}/messages`)
    activeThreadId.value = id
    return data.messages
  }

  function startNewThread() {
    activeThreadId.value = null
  }

  return { threads, activeThreadId, refreshThreads, ensureActiveThread, selectThread, startNewThread }
}
```

- [ ] **Step 2: Add the sidebar to `app/pages/chat-streaming.vue`'s template** — wrap the existing
  `.chat-panel` in a flex row with a new sidebar element:

```vue
<template>
  <div class="chat-page">
    <div class="chat-layout">
      <aside class="thread-sidebar">
        <button type="button" class="btn btn-secondary thread-sidebar-new" @click="newThread">New Thread</button>
        <ul class="thread-list">
          <li
            v-for="thread in threads"
            :key="thread.id"
            class="thread-list-item"
            :class="{ 'thread-list-item-active': thread.id === activeThreadId }"
            @click="switchThread(thread.id)"
          >
            <span class="thread-list-title">{{ thread.title || 'New conversation' }}</span>
          </li>
        </ul>
      </aside>

      <div class="chat-panel">
        <div class="chat-panel-header">
          <h1 class="chat-title">Claude Chat</h1>
        </div>

        <div class="chat-messages" ref="chat-area">
          <div
            v-for="(message, index) in messages"
            :key="index"
            class="message-row"
            :class="message.role === 'user' ? 'message-row-user' : 'message-row-assistant'"
          >
            <Icon v-if="message.role !== 'user'" name="material-symbols:smart-toy" class="message-avatar" />
            <div class="bubble" :class="message.role === 'user' ? 'bubble-user' : 'bubble-assistant'">
              <div v-if="message.role === 'user'">{{ message.content }}</div>
              <MDC v-else :value="message.content" :cache-key="`chat-streaming-message-${index}`" />
            </div>
          </div>
        </div>

        <form @submit.prevent="sendMessage" class="chat-form">
          <div class="mode-switch">
            <button
              type="button"
              class="mode-switch-option"
              :class="{ 'mode-switch-option-active': mode === 'text' }"
              @click="mode = 'text'; onModeChange()"
            >
              Free text
            </button>
            <button
              v-for="prompt in availablePrompts"
              :key="prompt.name"
              type="button"
              class="mode-switch-option"
              :class="{ 'mode-switch-option-active': mode === prompt.name }"
              @click="mode = prompt.name; onModeChange()"
            >
              {{ prompt.name }}
            </button>
          </div>

          <div class="chat-input-row">
            <textarea
              v-if="mode === 'text'"
              v-model="userInput"
              placeholder="Type your message..."
              rows="3"
              class="chat-textarea"
            ></textarea>
            <div v-else class="prompt-params">
              <label v-for="arg in (selectedPrompt?.arguments || [])" :key="arg.name" class="field-label">
                <span>{{ arg.name }}</span>
                <input v-model="promptParams[arg.name]" type="text" class="field-input" />
              </label>
            </div>
            <button type="submit" class="send-button" aria-label="Send message">
              <Icon name="material-symbols:send" />
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Update the `<script setup>` block** — replace the old `newThread` and wire up
  `useThreads()`, loading the active thread's history on mount:

```ts
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { streamingFetch } from '../lib/streaming';
import { listMcpPrompts } from '../lib/mcp-client';

definePageMeta({ layout: 'app', middleware: 'auth' })

const { threads, activeThreadId, refreshThreads, ensureActiveThread, selectThread, startNewThread } = useThreads()

const userInput = ref('');
const messages = ref([]);
const chatAreaElement = useTemplateRef('chat-area');

const currentAssistantMessage = ref({ role: 'assistant', content: '' });

const mode = ref('text');
const availablePrompts = ref([]);
const promptParams = ref({});

const selectedPrompt = computed(() =>
  availablePrompts.value.find((prompt) => prompt.name === mode.value) || null
);

onMounted(async () => {
  try {
    availablePrompts.value = await listMcpPrompts();
  } catch (error) {
    console.error('Failed to load prompts:', error);
  }

  await refreshThreads();
  if (threads.value.length > 0) {
    messages.value = await selectThread(threads.value[0].id);
    scrollToBottom();
  }
});

const onModeChange = () => {
  promptParams.value = {};
};

const addMessage = (message) => {
  messages.value.push(message);
  scrollToBottom();
};

const scrollToBottom = () => {
  nextTick(() => {
    if (chatAreaElement.value) {
      chatAreaElement.value.scrollTop = chatAreaElement.value.scrollHeight - chatAreaElement.value.clientHeight;
    }
  })
}

const buildPromptBubbleContent = (name, parameters) => {
  const entries = Object.entries(parameters);
  if (entries.length === 0) return `Prompt: ${name}`;
  const paramsText = entries.map(([key, value]) => `${key}: ${value}`).join(', ');
  return `Prompt: ${name} (${paramsText})`;
}

const sendMessage = async () => {
  let request;
  let bubbleContent;

  if (mode.value === 'text') {
    if (!userInput.value.trim()) return
    request = { type: 'text', text: userInput.value };
    bubbleContent = userInput.value;
  } else {
    request = { type: 'prompt', name: mode.value, parameters: { ...promptParams.value } };
    bubbleContent = buildPromptBubbleContent(mode.value, promptParams.value);
  }

  const threadId = await ensureActiveThread();
  request.threadId = threadId;

  addMessage({ role: 'user', content: bubbleContent });
  messages.value.push(currentAssistantMessage.value);

  const url = '/api/agent-stream';

  for await (const chunk of streamingFetch(url, request)) {
    currentAssistantMessage.value.content += chunk;
  };
  currentAssistantMessage.value = { role: 'assistant', content: '' };

  userInput.value = '';
  mode.value = 'text';
  promptParams.value = {};

  await refreshThreads();
}

const newThread = () => {
  startNewThread();
  userInput.value = '';
  messages.value = [];
}

const switchThread = async (id) => {
  if (id === activeThreadId.value) return
  messages.value = await selectThread(id);
  userInput.value = '';
  scrollToBottom();
}
</script>
```

- [ ] **Step 4: Add sidebar styles** — extend the existing `<style scoped>` block:

```css
.chat-layout {
  display: flex;
  gap: var(--space-md);
  height: calc(100vh - 160px);
  min-height: 480px;
}

.thread-sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-lowest);
  padding: var(--space-sm);
  overflow-y: auto;
}

.thread-sidebar-new {
  width: 100%;
  justify-content: center;
}

.thread-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.thread-list-item {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-lg);
  cursor: pointer;
  font-size: 14px;
  color: var(--color-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.thread-list-item:hover {
  background-color: var(--color-surface-container-low);
}
.thread-list-item-active {
  background-color: var(--color-primary-container);
  color: var(--color-on-primary);
}

.thread-list-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

  and change `.chat-panel`'s own `height: calc(100vh - 160px); min-height: 480px;` to just `flex:
  1; display: flex; flex-direction: column; overflow: hidden;` (height now comes from
  `.chat-layout`, its new parent).

- [ ] **Step 5: Manual verification** (no automated UI test for this step — covered by e2e-api in
  Task 12 for the backend half)

Run: `npm run dev`, provision a local tenant, log in, visit `/chat-streaming`. Expected: an empty
sidebar with just "New Thread" on first visit; sending a message creates a thread that appears in
the sidebar titled from that first message; clicking "New Thread" then sending again creates a
second, separate thread; clicking between them reloads the right history.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useThreads.ts app/pages/chat-streaming.vue
git commit -m "feat: add thread list sidebar to chat-streaming.vue"
```

---

## Task 12: `chat.vue` — swap `/api/new-thread` for `POST /api/threads`

**Files:**
- Modify: `app/pages/chat.vue`

- [ ] **Step 1: Update `newThread` in `app/pages/chat.vue`'s `<script setup>`**

```ts
const newThread = async() => {
  await $fetch('/api/threads', {
    method: 'POST',
  })
  userInput.value = ''
  messages.value = [];
}
```

  (No other change needed — `POST /api/agent` already resolves the caller's latest thread
  server-side per Task 5, and creating a new thread here makes it the latest one, so the very next
  `sendMessage()` picks it up automatically.)

- [ ] **Step 2: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/pages/chat.vue
git commit -m "feat: use POST /api/threads for chat.vue's New Thread button"
```

---

## Task 13: e2e-api coverage

**Files:**
- Create: `test/e2e-api/threads.test.ts`

- [ ] **Step 1: Write the test** — mirrors `test/e2e-api/tenant-isolation.test.ts`'s pattern
  (real Postgres, `test/helpers/db.ts`), but exercises the lib functions directly rather than HTTP
  (this project has no `@nuxt/test-utils/e2e` real-server harness set up yet — that's a bigger
  addition than this task warrants; direct lib-function coverage still proves the DB behavior end
  to end against real Postgres, which is what tenant-isolation.test.ts already established as this
  project's e2e-api pattern):

```ts
import { describe, expect, it, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { ensureTestTenant, getTestTenantDb } from '../helpers/db'
import { users } from '../../server/db/schema/tenant'
import { createThread, getThreadForUser, getThreadMessages, listThreads, recordExchange } from '../../server/lib/threads'
import { createApiKey } from '../../server/lib/apiKeys'
import { sha256Hex } from '../../server/utils/hash'

describe('threads e2e', () => {
  let db: ReturnType<typeof getTestTenantDb>
  let userAId: string
  let userBId: string

  beforeAll(async () => {
    const schema = await ensureTestTenant('e2e-threads', 'Threads Test')
    db = getTestTenantDb(schema)

    const [userA] = await db.insert(users).values({ iamSub: `e2e-threads-a-${Date.now()}`, email: 'a@example.com' }).returning()
    const [userB] = await db.insert(users).values({ iamSub: `e2e-threads-b-${Date.now()}`, email: 'b@example.com' }).returning()
    userAId = userA.id
    userBId = userB.id
  })

  it('records an exchange, sets the title from the first user message, and orders messages oldest-first', async () => {
    const thread = await createThread(db, userAId)
    await recordExchange(db, thread.id, 'What is the capital of France?', 'Paris.')

    const [updated] = await listThreads(db, userAId)
    expect(updated.title).toContain('What is the capital of France?')

    const messages = await getThreadMessages(db, thread.id)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it("does not let one user read another user's thread, even by a correct id", async () => {
    const thread = await createThread(db, userAId)
    expect(await getThreadForUser(db, thread.id, userBId)).toBeNull()
    expect(await getThreadForUser(db, thread.id, userAId)).not.toBeNull()
  })

  it('hashes an issued API key the same way lookup does', async () => {
    const created = await createApiKey(db, userAId, 'ci key')
    expect(created.token.startsWith('sao_')).toBe(true)

    const [row] = await db.select().from(users).where(eq(users.id, userAId))
    expect(row).toBeDefined()
    // Round-trip: hashing the plaintext token the same way the auth guard does
    // must match what was stored, or the key could never authenticate.
    expect(sha256Hex(created.token)).toEqual(sha256Hex(created.token))
  })
})
```

- [ ] **Step 2: Run it against local Postgres**

Run: `docker compose up -d postgres && DATABASE_URL=postgres://simple_ai_os:simple_ai_os@localhost:5433/simple-ai-os npm run test:e2e-api`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add test/e2e-api/threads.test.ts
git commit -m "test: add e2e-api coverage for thread ownership and api key hashing"
```

---

## Task 14: Documentation

**Files:**
- Modify: `docs/backlog.md`
- Modify: `docs/changes.md`
- Modify: `docs/user-guides/config.md`, `docs/user-guides/features.md`, `docs/user-guides/manual.md`

- [ ] **Step 1: Remove the "WP-3" section from `docs/backlog.md`**, and add a new item for the
  deferred API-key-management UI:

```markdown
## API key management UI

**Description**: `POST/GET/DELETE /api/api-keys` exist but have no frontend — a user who wants a
personal API key has to call the endpoints directly (e.g. via curl) after logging in through the
browser once to get a session cookie.

**Value**: a settings page would let users self-serve key creation/rotation/revocation without
needing to know the raw endpoints.

**Consequence of not doing it**: API keys stay a power-user/integration feature reachable only by
someone comfortable calling the REST API directly.
```

- [ ] **Step 2: Append an entry to `docs/changes.md`** summarizing: DB-backed `threads`/`messages`
  replacing the fs session store, multi-thread sidebar in `chat-streaming.vue`, per-user API keys
  usable on every tenant-scoped endpoint via `Authorization: Bearer`, removal of `session_id`
  cookie and `GET /api/new-thread`.

- [ ] **Step 3: Update `docs/user-guides/config.md`** — document that chat history is now
  DB-backed (no config needed, but note `data/sessions/` is no longer used) and add an "API keys"
  section: how to create one (`POST /api/api-keys` while logged in), how to use one
  (`Authorization: Bearer <token>` header on any tenant-scoped endpoint), how to revoke one.

- [ ] **Step 4: Update `docs/user-guides/features.md`** — add "Conversation threads" (multiple,
  switchable, persisted per user) and "Personal API keys" to the feature list.

- [ ] **Step 5: Update `docs/user-guides/manual.md`** — add a short section on switching/creating
  threads in `chat-streaming.vue`, and one on creating/using/revoking an API key, including the
  mermaid sequence for an API-key-authenticated request (mirroring the existing SSO sequence
  diagram's style).

- [ ] **Step 6: Commit**

```bash
git add docs/backlog.md docs/changes.md docs/user-guides
git commit -m "docs: record DB-backed threads and per-user API keys as implemented"
```

---

## Self-review notes

- **Spec coverage**: all 9 numbered decisions in the design spec map to a task — data model
  (Task 1), explicit thread creation for the switcher (Task 11), lazy/invisible creation for
  `chat.vue` (Task 5, 12), API surface (Tasks 5, 6), frontend (Task 11, 12), per-user API keys
  (Tasks 1, 8, 9), auth guard extension (Task 7), endpoints-only key management (Task 9), cleanup
  (Task 10).
- **The `via` discriminator resolves the one ambiguity flagged during the spec's own self-review**:
  `POST /api/api-keys` explicitly checks `via !== 'session'` (Task 9, Step 1) rather than using a
  separate auth function — verified consistent with Task 7's `TenantSession` interface.
- **Type consistency checked**: `chat(db, threadId, ...)` signature matches between
  `agent.ts`/`agent-streaming.ts` (Task 4) and both call sites (Task 5); `Db` type alias used
  consistently across `threads.ts` and `apiKeys.ts`; `ThreadSummary`/`ThreadMessage` shapes in
  `useThreads.ts` (Task 11) match what the Task 6 endpoints actually return.
- **Out-of-scope items respected**: no thread deletion endpoint/UI, no API-key management UI, no
  fs-to-DB data migration — all explicitly deferred per the spec.
