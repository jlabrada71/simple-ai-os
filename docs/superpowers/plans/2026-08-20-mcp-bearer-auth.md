# Tenant-Scoped Bearer-Authenticated MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require authentication on `POST /mcp`, closing the last unauthenticated tenant-data
surface in the app.

**Architecture:** Swap `mcp.post.ts`'s manual tenant-only check for `requireTenantSession`, the
same guard already used by every other tenant-scoped endpoint — no new auth mechanism.

**Tech Stack:** Nuxt 4/Nitro, existing `server/utils/requireTenantSession.ts`.

**Spec:** `docs/superpowers/specs/2026-08-20-mcp-bearer-auth-design.md`

---

## File structure

| File | Responsibility |
|---|---|
| `server/routes/mcp.post.ts` | require `requireTenantSession` instead of a bare tenant check (modified) |
| `docs/backlog.md` | remove the completed WP-5 item (modified) |
| `docs/changes.md` | record the change (modified) |
| `docs/user-guides/config.md`, `features.md` | document that `/mcp` now requires auth (modified) |

---

## Task 1: Require auth on `POST /mcp`

**Files:**
- Modify: `server/routes/mcp.post.ts`

- [ ] **Step 1: Read the current file** to confirm nothing has shifted since this plan was
  written:

```ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from '../mcp/server'
import { withTenantDb } from '../db/client'
import type { TenantContext } from '../utils/tenant'

export default defineEventHandler(async (event) => {
  const tenant = event.context.tenant as TenantContext | null
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown tenant' })
  }

  const body = await readBody(event)
  const server = await withTenantDb(tenant.schemaName, (db) => createMcpServer(db))
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  event.node.res.on('close', () => {
    transport.close()
    server.close()
  })

  await server.connect(transport)
  await transport.handleRequest(event.node.req, event.node.res, body)
})
```

- [ ] **Step 2: Rewrite it to require a valid session**

```ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from '../mcp/server'
import { withTenantDb } from '../db/client'
import { requireTenantSession } from '../utils/requireTenantSession'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantSession(event)

  const body = await readBody(event)
  const server = await withTenantDb(tenant.schemaName, (db) => createMcpServer(db))
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  event.node.res.on('close', () => {
    transport.close()
    server.close()
  })

  await server.connect(transport)
  await transport.handleRequest(event.node.req, event.node.res, body)
})
```

  (`requireTenantSession` already throws 404 for an unknown/unresolved tenant and 401 for a
  missing/invalid credential — matches and extends the previous behavior, doesn't change the
  404 case.)

- [ ] **Step 3: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS (no test file exercises this route directly today; this just confirms nothing
else broke)

- [ ] **Step 4: Manual verification against a live server + real Postgres** — provision a local
  tenant, create a prompt and an API key for a tenant user (mirroring the verification approach
  used for phase 1/2/WP-3):

```bash
# with the dev server running and DATABASE_URL/NUXT_TENANT_SECRET_ENCRYPTION_KEY set:
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Host: <slug>.localhost:3100" \
  -H "content-type: application/json" http://localhost:3100/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}'
# Expected: 401 (no Authorization header)

curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Host: <slug>.localhost:3100" \
  -H "authorization: Bearer <minted sao_ token>" -H "content-type: application/json" \
  http://localhost:3100/mcp -d '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}'
# Expected: 200, with that tenant's prompts in the response body
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/mcp.post.ts
git commit -m "feat: require tenant authentication on POST /mcp"
```

---

## Task 2: Documentation

**Files:**
- Modify: `docs/backlog.md`
- Modify: `docs/changes.md`
- Modify: `docs/user-guides/config.md`, `docs/user-guides/features.md`

- [ ] **Step 1: Remove the "WP-5" section from `docs/backlog.md`.**

- [ ] **Step 2: Append an entry to `docs/changes.md`** summarizing: `POST /mcp` now requires
  `requireTenantSession` (bearer API key or session cookie), closing the last
  unauthenticated tenant-data surface.

- [ ] **Step 3: Update `docs/user-guides/config.md`'s "API keys" section** to mention `/mcp` is
  now included in "any tenant-scoped REST endpoint" (it already says this generically — confirm
  the wording doesn't need a specific `/mcp` callout, and add one if the existing phrasing reads
  as REST-only and would exclude MCP by a literal reading).

- [ ] **Step 4: Update `docs/user-guides/features.md`'s MCP bullet** to note it now requires
  authentication.

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md docs/changes.md docs/user-guides/config.md docs/user-guides/features.md
git commit -m "docs: record bearer-authenticated MCP as implemented"
```

---

## Self-review notes

- **Spec coverage**: the spec's single decision (reuse `requireTenantSession`) maps directly to
  Task 1; the "out of scope" items (GET/DELETE/OPTIONS, internal MCP call path, API-key-only
  restriction) require no task since nothing touches them.
- **Type consistency**: `requireTenantSession`'s existing `{ tenant, user, via }` return shape is
  unchanged; Task 1 only destructures `{ tenant }`, matching how `server/api/prompts/**` already
  uses it.
