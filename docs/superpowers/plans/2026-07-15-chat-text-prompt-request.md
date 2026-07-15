# Chat Text/Prompt Request Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the streaming chat client/server pair to exchange a typed `ChatRequest` (`text` or
`prompt`) instead of a bare `{ message: string }`, resolving `prompt` requests server-side through the
real MCP prompt registry.

**Architecture:** A shared Zod-backed discriminated union (`shared/types/chat.ts`) defines the request
shape for both `app/` and `server/`. The client (`app/lib/streaming.ts`, `chat-streaming.vue`) sends the
typed object. The server (`agent-stream.post.ts`, `agent-streaming.ts`) validates it, and for `prompt`
requests resolves the interpolated text via an in-process MCP client wired directly to
`createMcpServer()` with `InMemoryTransport.createLinkedPair()`.

**Tech Stack:** Nuxt 4 (`shared/` auto-import dir), Zod, `@modelcontextprotocol/sdk` (already a
dependency), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-chat-text-prompt-request-design.md`

---

### Task 1: Shared `ChatRequest` type and schema

**Files:**
- Create: `shared/types/chat.ts`
- Test: `shared/types/chat.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/types/chat.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run shared/types/chat.test.ts`
Expected: FAIL — `Cannot find module './chat'` (or similar resolution error), since `shared/types/chat.ts`
doesn't exist yet.

Note: `vitest.config.ts` currently sets `include: ['server/**/*.test.ts']`. This task's Step 2a below
widens that so `shared/**/*.test.ts` is picked up too — do that first if the run reports "No test files
found" instead of a module error.

- [ ] **Step 2a: Widen the Vitest include glob**

Modify `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
  },
})
```

Re-run: `npx vitest run shared/types/chat.test.ts`
Expected: FAIL — module `./chat` not found.

- [ ] **Step 3: Write the schema**

Create `shared/types/chat.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run shared/types/chat.test.ts`
Expected: PASS — 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add shared/types/chat.ts shared/types/chat.test.ts vitest.config.ts
git commit -m "feat: add shared ChatRequest type and schema"
```

---

### Task 2: Update the client to send `ChatRequest`

**Files:**
- Modify: `app/lib/streaming.ts`
- Modify: `app/pages/chat-streaming.vue`

- [ ] **Step 1: Update `streamingFetch` to accept a `ChatRequest`**

Replace the full contents of `app/lib/streaming.ts`:

```ts
import type { ChatRequest } from '../../shared/types/chat'

export async function* streamingFetch(url: string, request: ChatRequest): AsyncGenerator<string>{
  try {
    // 1. Explicitly request 'stream' as the response type
    const response = await $fetch<ReadableStream>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      responseType: 'stream'
    })

    // 2. Obtain a reader from the ReadableStream instance
    const reader = response.getReader()
    const decoder = new TextDecoder()

    // 3. Incrementally read incoming chunks from the network pipeline
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Decode the binary Uint8Array chunk into readable text
      yield decoder.decode(value, { stream: true });   
    }
  } catch (error) {
    console.error('Streaming error:', error)
  } finally {
    
  }
}
```

Note: `ChatRequest` is defined in `shared/types/chat.ts`, which Nuxt 4 auto-imports as a *type* in both
`app/` and `server/` — but auto-import only covers usage without an explicit import statement in most
`.vue`/`.ts` files under those trees. `app/lib/streaming.ts` is a plain module (not a component or page),
so it needs the explicit relative import shown above to be safe; Nuxt's auto-import is unreliable for
plain `.ts` library files outside `composables/`/`utils/`.

- [ ] **Step 2: Update `chat-streaming.vue`'s `sendMessage`**

In `app/pages/chat-streaming.vue`, replace:

```js
  for await (const chunk of streamingFetch(url, userInput.value)) {
    currentAssistantMessage.value.content += chunk;    
  };
```

with:

```js
  for await (const chunk of streamingFetch(url, { type: 'text', text: userInput.value })) {
    currentAssistantMessage.value.content += chunk;    
  };
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `app/lib/streaming.ts` or `app/pages/chat-streaming.vue`.

- [ ] **Step 4: Commit**

```bash
git add app/lib/streaming.ts app/pages/chat-streaming.vue
git commit -m "feat: send typed ChatRequest from the streaming chat client"
```

---

### Task 3: Add server-side prompt resolution

**Files:**
- Modify: `server/lib/agent-streaming.ts`

- [ ] **Step 1: Remove the dead MCP scaffolding**

In `server/lib/agent-streaming.ts`, delete these imports (no longer used after this task):

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  mcpTools,
  mcpMessages,
  mcpResourceToContent,
  mcpResourceToFile
} from "@anthropic-ai/sdk/helpers/beta/mcp";
```

and delete this module-level block:

```ts
// Connect to an MCP server
const transport = new StdioClientTransport({
    command: 'node',
    args: ['../mcp/server.ts']
});
const mcpClient = new Client({ name: "my-client", version: "1.0.0" });
await mcpClient.connect(transport);
```

and delete the `mcp_servers` array and `tools` array from the `client.messages.create({...})` call
inside `chat()`:

```ts
                // Declare the backend MCP servers Claude has access to
                mcp_servers: [
                    {
                    name: "production-db",
                    transport: {
                        type: "stdio", // or "http" for Streamable HTTP architectures
                        command: "node",
                        args: ["../mcp/server.ts"]
                    }
                    }
                    // You can attach multiple MCP servers in a single request array
                ],
                // Instruct the Messages API to explicitly leverage the attached MCP tools
                tools: [
                    { type: "mcp_toolset" }
                ],
```

(Both blocks referenced the same nonexistent `../mcp/server.ts` path and were never functional — the
real prompts MCP server lives at `server/mcp/server.ts` and is served over `/mcp`, unrelated to this
dead code.)

- [ ] **Step 2: Add the new imports**

Add at the top of `server/lib/agent-streaming.ts`, alongside the existing `Anthropic` import:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../mcp/server";
import { chatRequestSchema, type ChatRequest } from "../../shared/types/chat";
```

- [ ] **Step 3: Add `resolvePromptText`**

Add this function above `chat()` in `server/lib/agent-streaming.ts`:

```ts
async function resolvePromptText(name: string, parameters?: Record<string, string>): Promise<string> {
    const server = await createMcpServer();
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "agent-streaming", version: "1.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.getPrompt({ name, arguments: parameters });
    const [firstMessage] = result.messages;
    const text = (firstMessage.content as { type: "text"; text: string }).text;

    await client.close();
    await server.close();

    return text;
}
```

- [ ] **Step 4: Update `chat()`'s signature and body**

Replace the `chat` function signature:

```ts
export function chat(sessionId: string, userMessage: string): ReadableStream<string> {
```

with:

```ts
export function chat(sessionId: string, request: ChatRequest): ReadableStream<string> {
```

Replace this line inside the `start(controller)` callback:

```ts
            addUserMessage(messages, userMessage);
```

with:

```ts
            const userMessageText = request.type === "text"
                ? request.text
                : await resolvePromptText(request.name, request.parameters);

            addUserMessage(messages, userMessageText);
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `server/lib/agent-streaming.ts`. (`chatRequestSchema` is imported but
unused in this file — that's fine, it's consumed in Task 4; if `tsc`/`eslint` flags an unused import,
remove the `chatRequestSchema` half of the Task 3 Step 2 import and keep only `type ChatRequest`, since
`chat()` itself only needs the type, not the schema.)

- [ ] **Step 6: Commit**

```bash
git add server/lib/agent-streaming.ts
git commit -m "feat: resolve prompt requests via in-process MCP client in agent-streaming"
```

---

### Task 4: Validate the request in the API route

**Files:**
- Modify: `server/api/agent-stream.post.ts`

- [ ] **Step 1: Update the route to parse and pass a `ChatRequest`**

Replace the full contents of `server/api/agent-stream.post.ts`:

```ts
import { chat } from '../lib/agent-streaming';
import { initSession } from '../lib/session';
import { chatRequestSchema } from '../../shared/types/chat';

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const request = chatRequestSchema.parse(body)

    const sessionId = getCookie(event, 'session_id') || (await initSession(event)).sessionId;
    console.log(`Session ID: ${sessionId}`);
    if (!sessionId) {
        return { error: 'No valid session found' }
    }

    const stream = chat(sessionId, request);    


    return sendStream(event, stream);
})
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `server/api/agent-stream.post.ts`.

- [ ] **Step 3: Commit**

```bash
git add server/api/agent-stream.post.ts
git commit -m "feat: validate ChatRequest in the agent-stream route"
```

---

### Task 5: End-to-end manual verification

Neither `chat()` nor `resolvePromptText()` are practically unit-testable (real Postgres via
`createMcpServer()`'s `listPrompts()`, plus a real Anthropic API call in `chat()`). Verify manually
against the running stack, mirroring the prior MCP-client verification
(`docs/superpowers/plans/2026-07-13-prompts-mcp-client.md`, Task 2).

**Files:** none (verification only)

- [ ] **Step 1: Start the stack**

Run: `docker compose up -d --build -V postgres dev`

- [ ] **Step 2: Confirm the app is up**

Run: `sleep 5 && curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000`
Expected: `200`

- [ ] **Step 3: Seed a prompt with a variable (skip if `chat-prompt-check` already exists from a prior run)**

Run:
```bash
curl -s -X POST http://localhost:3000/api/prompts \
  -H 'content-type: application/json' \
  -d '{"name":"chat-prompt-check","content":"Say hello to {{name}} and nothing else.","variables":["name"]}'
```
Expected: `201` with the created row (or `409` if it already exists — either is fine, proceed).

- [ ] **Step 4: Verify the `text` path still works**

Run:
```bash
curl -s -i -c /tmp/chat-cookies.txt -X POST http://localhost:3000/api/agent-stream \
  -H 'content-type: application/json' \
  -d '{"type":"text","text":"Reply with exactly the word OK and nothing else."}'
```
Expected: `200` response, body streams text containing `OK` (allowing for minor whitespace/punctuation
from the model).

- [ ] **Step 5: Verify the `prompt` path resolves and reaches Claude**

Run:
```bash
curl -s -i -b /tmp/chat-cookies.txt -X POST http://localhost:3000/api/agent-stream \
  -H 'content-type: application/json' \
  -d '{"type":"prompt","name":"chat-prompt-check","parameters":{"name":"Ada"}}'
```
Expected: `200` response, body streams a greeting addressed to "Ada" — confirms `resolvePromptText`
correctly interpolated the saved prompt's `{{name}}` placeholder and that text reached Claude.

- [ ] **Step 6: Verify an invalid request is rejected**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/agent-stream \
  -H 'content-type: application/json' \
  -d '{"type":"text","text":""}'
```
Expected: `400` (Zod validation failure on empty `text`).

- [ ] **Step 7: Clean up**

Run: `rm -f /tmp/chat-cookies.txt`

- [ ] **Step 8: Confirm the full unit test suite still passes**

Run: `docker compose exec dev npm test`
Expected: PASS — 31 tests green (23 existing + 8 new `chatRequestSchema` tests from Task 1).

- [ ] **Step 9: Tear down**

Run: `docker compose down`

---

## Self-Review Notes

- **Spec coverage:** shared type/schema (Task 1), client request construction (Task 2), dead-code
  removal + in-process MCP resolution (Task 3), route-level validation (Task 4), manual verification of
  both `text` and `prompt` paths plus an invalid-request rejection (Task 5). `chat.vue`/`agent.ts`
  correctly untouched (out of scope per spec).
- **Type consistency:** `ChatRequest` (Task 1) is threaded unchanged through `streamingFetch` (Task 2),
  `chat()` (Task 3), and the route handler (Task 4) — same field names (`type`, `text`, `name`,
  `parameters`) throughout.
- **No placeholders:** all steps contain complete, runnable code; no "add error handling" style steps.
