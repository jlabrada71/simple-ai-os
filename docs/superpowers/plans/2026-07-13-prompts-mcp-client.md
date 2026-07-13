# Prompts MCP Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable browser-side MCP client module (`app/lib/mcp-client.ts`) for the prompts MCP server, mirroring `app/lib/streaming.ts`'s role. No UI wiring in this change.

**Architecture:** A module-scoped singleton `Client`/`StreamableHTTPClientTransport` pair, lazily connected to `window.location.origin + '/mcp'`, exposing `connectPromptsClient`, `listMcpPrompts`, `getMcpPrompt`, `disconnectPromptsClient`.

**Tech Stack:** `@modelcontextprotocol/sdk` (already a dependency).

**Spec:** `docs/superpowers/specs/2026-07-13-prompts-mcp-client-design.md`

---

### Task 1: Create the MCP client module

**Files:**
- Create: `app/lib/mcp-client.ts`

- [ ] **Step 1: Create the module**

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

let client: Client | null = null
let transport: StreamableHTTPClientTransport | null = null

export async function connectPromptsClient() {
  if (client) return client
  const url = new URL('/mcp', window.location.origin)
  transport = new StreamableHTTPClientTransport(url)
  client = new Client({ name: 'simple-ai-os-web', version: '1.0.0' })
  await client.connect(transport)
  return client
}

export async function listMcpPrompts() {
  const activeClient = await connectPromptsClient()
  const { prompts } = await activeClient.listPrompts()
  return prompts
}

export async function getMcpPrompt(name: string, args?: Record<string, string>) {
  const activeClient = await connectPromptsClient()
  return activeClient.getPrompt({ name, arguments: args })
}

export async function disconnectPromptsClient() {
  if (!client) return
  await client.close()
  client = null
  transport = null
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `app/lib/mcp-client.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/lib/mcp-client.ts
git commit -m "feat: add reusable MCP client module for the prompts server"
```

---

### Task 2: End-to-end manual verification

Since this module isn't wired into any page yet and references `window` (browser-only), it's
verified with a throwaway Node script that shims `globalThis.window` and drives the module's
exported functions against the real running `/mcp` server — not a new UI page (out of scope
per the spec) and not a unit test (no branching logic to unit test, per the spec's Testing
section).

**Files:** none (verification only; the script lives in the scratchpad, not the repo)

- [ ] **Step 1: Start the stack**

Run: `docker compose up -d --build -V postgres dev`

- [ ] **Step 2: Confirm the app is up**

Run: `sleep 5 && curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000`
Expected: `200`

- [ ] **Step 3: Seed a prompt with a variable (skip if `mcp-greeting` already exists from prior verification)**

Run:
```bash
curl -s -X POST http://localhost:3000/api/prompts \
  -H 'content-type: application/json' \
  -d '{"name":"mcp-client-check","content":"Hello, {{name}}, from the MCP client!","variables":["name"]}'
```
Expected: `201` with the created row (or a `409` if it already exists from a prior run of this
verification step — either is fine, proceed).

- [ ] **Step 4: Write the verification script**

Create `/tmp/verify-mcp-client.mjs` (adjust path to your scratchpad directory if you have one)
with this content — it mirrors `app/lib/mcp-client.ts` exactly but as a standalone `.mjs` file
with `window` shimmed, so it can run directly under `node` without a Vite/Nuxt build step:

```js
globalThis.window = { location: { origin: 'http://localhost:3000' } }

const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')

let client = null
let transport = null

async function connectPromptsClient() {
  if (client) return client
  const url = new URL('/mcp', window.location.origin)
  transport = new StreamableHTTPClientTransport(url)
  client = new Client({ name: 'verify-script', version: '1.0.0' })
  await client.connect(transport)
  return client
}

async function listMcpPrompts() {
  const activeClient = await connectPromptsClient()
  const { prompts } = await activeClient.listPrompts()
  return prompts
}

async function getMcpPrompt(name, args) {
  const activeClient = await connectPromptsClient()
  return activeClient.getPrompt({ name, arguments: args })
}

async function disconnectPromptsClient() {
  if (!client) return
  await client.close()
  client = null
  transport = null
}

const prompts = await listMcpPrompts()
console.log('listMcpPrompts:', prompts.map((p) => p.name))

const result = await getMcpPrompt('mcp-client-check', { name: 'Ada' })
console.log('getMcpPrompt text:', result.messages[0].content.text)

await disconnectPromptsClient()
console.log('disconnected OK')
```

- [ ] **Step 5: Run it**

Run: `node /tmp/verify-mcp-client.mjs`

Expected output:
```
listMcpPrompts: [ ... 'mcp-client-check' ... ]
getMcpPrompt text: Hello, Ada, from the MCP client!
disconnected OK
```

- [ ] **Step 6: Clean up the throwaway script**

Run: `rm /tmp/verify-mcp-client.mjs`

- [ ] **Step 7: Confirm the full unit test suite still passes**

Run: `npm test`
Expected: PASS — 23 tests green (unchanged; this module has no dedicated tests per the spec).

- [ ] **Step 8: Tear down**

Run: `docker compose down`

---

## Self-Review Notes

- **Spec coverage:** module API surface (Task 1), same-origin URL construction (Task 1),
  connection caching (Task 1), manual end-to-end verification of connect/list/get/disconnect
  (Task 2), out-of-scope items (no page wiring, no retry logic, no stdio/SSE transports, no
  auth) correctly excluded.
- **Type consistency:** the verification script's function signatures mirror
  `app/lib/mcp-client.ts` exactly, so a pass here is meaningful evidence the real module works.
- **No placeholders:** all steps contain complete, runnable code.
