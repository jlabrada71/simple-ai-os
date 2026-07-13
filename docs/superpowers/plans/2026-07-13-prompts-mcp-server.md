# Prompts MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing prompts over MCP's native `prompts` primitive (`prompts/list`, `prompts/get`) at `POST /mcp`, running inside the same Nitro process as `/api/prompts`.

**Architecture:** A stateless Streamable HTTP MCP server — fresh `McpServer` + `StreamableHTTPServerTransport` per request, prompts dynamically registered from the current Postgres rows via `listPrompts`. `{{variable}}` placeholders in prompt content are substituted with any matching arguments an MCP client passes to `prompts/get`.

**Tech Stack:** `@modelcontextprotocol/sdk@^1.29.0` (new dependency), `zod` (existing), Nitro routes.

**Spec:** `docs/superpowers/specs/2026-07-13-prompts-mcp-server-design.md`

---

### Task 1: Install the MCP SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

Run: `npm install @modelcontextprotocol/sdk@^1.29.0`

- [ ] **Step 2: Regenerate the lockfile against the container's npm/node version**

Same issue as before: host npm (node 26/npm 11) and the `node:22-alpine` container's npm (v10)
resolve optional deps differently.

Run: `docker run --rm -v "$PWD":/app -w /app node:22-alpine npm install --package-lock-only --ignore-scripts`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @modelcontextprotocol/sdk dependency"
```

---

### Task 2: `interpolate` helper (TDD)

**Files:**
- Create: `server/lib/mcp-prompts.ts`
- Test: `server/lib/mcp-prompts.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/lib/mcp-prompts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { interpolate } from './mcp-prompts'

describe('interpolate', () => {
  it('substitutes a provided value', () => {
    expect(interpolate('Hello, {{name}}!', { name: 'Ada' })).toBe('Hello, Ada!')
  })

  it('leaves an unmatched placeholder untouched', () => {
    expect(interpolate('Hello, {{name}}!', {})).toBe('Hello, {{name}}!')
  })

  it('handles multiple distinct placeholders', () => {
    expect(interpolate('{{greeting}}, {{name}}!', { greeting: 'Hi', name: 'Ada' })).toBe('Hi, Ada!')
  })

  it('handles a placeholder appearing more than once', () => {
    expect(interpolate('{{name}} and {{name}} again', { name: 'Ada' })).toBe('Ada and Ada again')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- server/lib/mcp-prompts.test.ts`
Expected: FAIL — `Cannot find module './mcp-prompts'`.

- [ ] **Step 3: Implement `interpolate`**

Create `server/lib/mcp-prompts.ts`:

```ts
export function interpolate(content: string, args: Record<string, string | undefined>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => args[key] ?? match)
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test -- server/lib/mcp-prompts.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/lib/mcp-prompts.ts server/lib/mcp-prompts.test.ts
git commit -m "feat: add interpolate helper for MCP prompt argument substitution"
```

---

### Task 3: MCP server factory

**Files:**
- Create: `server/mcp/server.ts`

- [ ] **Step 1: Create the factory**

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { listPrompts } from '../lib/prompts'
import { interpolate } from '../lib/mcp-prompts'

export async function createMcpServer() {
  const server = new McpServer({ name: 'simple-ai-os-prompts', version: '1.0.0' })

  const { prompts: rows } = await listPrompts({ limit: 100 })

  for (const row of rows) {
    const argsSchema = Object.fromEntries(row.variables.map((name) => [name, z.string().optional()]))

    server.registerPrompt(
      row.name,
      { description: row.description ?? undefined, argsSchema },
      async (args) => ({
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: interpolate(row.content, args as Record<string, string | undefined>),
            },
          },
        ],
      }),
    )
  }

  return server
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `server/mcp/server.ts`.

- [ ] **Step 3: Commit**

```bash
git add server/mcp/server.ts
git commit -m "feat: add MCP server factory registering prompts from Postgres"
```

---

### Task 4: MCP HTTP routes

**Files:**
- Create: `server/routes/mcp.post.ts`
- Create: `server/routes/mcp.get.ts`
- Create: `server/routes/mcp.delete.ts`

- [ ] **Step 1: Create `server/routes/mcp.post.ts`**

```ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from '../mcp/server'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const server = await createMcpServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  event.node.res.on('close', () => {
    transport.close()
    server.close()
  })

  await server.connect(transport)
  await transport.handleRequest(event.node.req, event.node.res, body)
})
```

- [ ] **Step 2: Create `server/routes/mcp.get.ts`**

```ts
export default defineEventHandler((event) => {
  setResponseStatus(event, 405)
  return {
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  }
})
```

- [ ] **Step 3: Create `server/routes/mcp.delete.ts`**

```ts
export default defineEventHandler((event) => {
  setResponseStatus(event, 405)
  return {
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  }
})
```

- [ ] **Step 4: Run the full unit test suite**

Run: `npm test`
Expected: PASS — 23 tests green (19 existing + 4 new `interpolate` tests).

- [ ] **Step 5: Commit**

```bash
git add server/routes/mcp.post.ts server/routes/mcp.get.ts server/routes/mcp.delete.ts
git commit -m "feat: add /mcp Streamable HTTP routes for the prompts MCP server"
```

---

### Task 5: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Rebuild and start the stack**

Run: `docker compose up -d --build -V postgres dev`

- [ ] **Step 2: Confirm the app is up**

Run: `sleep 5 && curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000`
Expected: `200`

- [ ] **Step 3: Seed a prompt with a variable (skip if one already exists from prior testing)**

Run:
```bash
curl -s -X POST http://localhost:3000/api/prompts \
  -H 'content-type: application/json' \
  -d '{"name":"mcp-greeting","content":"Please greet {{name}} in a friendly manner.","variables":["name"]}'
```
Expected: 201 with the created row.

- [ ] **Step 4: Send an `initialize` request and confirm the `prompts` capability is advertised**

Run:
```bash
curl -s -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify","version":"1.0.0"}}}'
```
Expected: a JSON-RPC result containing `"capabilities":{"prompts":{...}}` (exact shape may vary
by SDK version, but a `prompts` key must be present).

- [ ] **Step 5: Send a `prompts/list` request**

Run:
```bash
curl -s -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"prompts/list","params":{}}'
```
Expected: a JSON-RPC result whose `result.prompts` array includes an entry with
`"name":"mcp-greeting"` and an `arguments` array containing `{"name":"name", ...}`.

- [ ] **Step 6: Send a `prompts/get` request with an argument and confirm substitution**

Run:
```bash
curl -s -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"prompts/get","params":{"name":"mcp-greeting","arguments":{"name":"Ada"}}}'
```
Expected: `result.messages[0].content.text` equals `"Please greet Ada in a friendly manner."`.

- [ ] **Step 7: Confirm GET and DELETE return 405**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/mcp
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3000/mcp
```
Expected: both `405`.

- [ ] **Step 8: Confirm the full test suite passes**

Run: `npm test`
Expected: PASS — 23 tests green.

- [ ] **Step 9: Tear down**

Run: `docker compose down`

---

## Self-Review Notes

- **Spec coverage:** SDK version choice (Task 1), `interpolate` substitution rule (Task 2),
  dynamic per-request prompt registration keyed by `name` (Task 3), stateless Streamable HTTP
  routes with 405s for GET/DELETE (Task 4), manual protocol-level verification including the
  substitution behavior (Task 5), out-of-scope items (auth, resources/tools, pagination,
  stateful sessions, REST API changes) correctly excluded.
- **Type consistency:** `createMcpServer` return type matches what `mcp.post.ts` expects
  (`Promise<McpServer>` used with `server.connect`/`server.close`). `interpolate`'s signature
  (`(content: string, args: Record<string, string | undefined>) => string`) matches its usage
  in `server/mcp/server.ts`.
- **No placeholders:** all steps contain complete, runnable code.
