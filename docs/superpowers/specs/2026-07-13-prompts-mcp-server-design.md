# Prompts MCP Server Design

## Purpose

Expose the existing prompts (stored in Postgres, already served by `/api/prompts`) over the
Model Context Protocol, so MCP clients (e.g. Claude Desktop) can list and fetch them using
MCP's native `prompts` primitive (`prompts/list`, `prompts/get`). The MCP server runs inside
the same Nitro process as the rest of the app, reachable at `POST /mcp` on the same port — no
new process, container, or port.

## SDK choice

`@modelcontextprotocol/sdk@1.29.0` (stable). The newer split packages
(`@modelcontextprotocol/server`/`client`/`core`) are at `2.0.0-beta.4` and not yet stable; the
1.x unified SDK has the same `registerPrompt(name, { description, argsSchema }, callback)` API
shape used in the reference example
(`examples/guides/servers/completion.examples.ts` in the SDK repo), and ships a ready-made
stateless Streamable HTTP example
(`examples/server/simpleStatelessStreamableHttp.js`) that this design follows directly.

## Session model

Stateless: a fresh `McpServer` and `StreamableHTTPServerTransport` are created per HTTP
request (`sessionIdGenerator: undefined`), matching the SDK's own stateless example. No
session store, no `Mcp-Session-Id` tracking. This keeps the door open for adding per-request
auth later (a bearer-token/API-key check ahead of the MCP dispatch) without also needing to
bind an identity to a long-lived session.

## New lib addition

### `server/lib/mcp-prompts.ts`

```ts
export function interpolate(content: string, args: Record<string, string | undefined>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => args[key] ?? match)
}
```

Pure function: replaces `{{key}}` with `args[key]` when provided; leaves the placeholder
untouched (does not replace with an empty string) when the argument wasn't given. Unit tested
directly (no DB/MCP involved).

## MCP server construction

### `server/mcp/server.ts`

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
            role: 'user',
            content: { type: 'text', text: interpolate(row.content, args as Record<string, string | undefined>) },
          },
        ],
      }),
    )
  }

  return server
}
```

Called fresh on every `POST /mcp` request (stateless), so the prompt list is always current as
of that request — no caching, no invalidation to manage. Capped at 100 rows (the API's max
`limit`); no MCP-side cursor pagination in this iteration.

MCP identifies prompts by `name`, which is already this app's unique column — `prompts/get`
requests naturally resolve to the right row with no id/name translation layer needed.

## HTTP routes

Three new Nitro routes under `server/routes/` (not `server/api/`, so they're reachable at
`/mcp` directly, matching "an mcp url" alongside `/api/prompts`):

### `server/routes/mcp.post.ts`

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

### `server/routes/mcp.get.ts` and `server/routes/mcp.delete.ts`

Both return the SDK stateless example's canned 405, since this server supports neither
server-initiated SSE streams (GET) nor session termination (DELETE) in stateless mode:

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

(Two near-identical files rather than one shared handler, matching this app's existing
convention of one file per HTTP method under `server/api/prompts/`.)

## Error handling

If `listPrompts`/DB access fails while building the server (before `transport.handleRequest`
runs), the error propagates out of the Nitro handler and Nitro's default error handling
returns a 500 — consistent with how other route handlers in this app let unexpected errors
surface (see `server/api/prompts/index.post.ts`'s `throw err` fallthrough).

## Dependencies

Add `@modelcontextprotocol/sdk` (`^1.29.0`) to `package.json` dependencies. `zod` is already a
dependency.

## Testing

Unit test `interpolate` in `server/lib/mcp-prompts.test.ts`:
- substitutes a provided value
- leaves an unmatched placeholder untouched
- handles multiple distinct placeholders
- handles a placeholder appearing more than once in the same string

No dedicated tests for `createMcpServer` or the route handlers — verified manually (Task in the
implementation plan) using `curl` against the JSON-RPC `initialize` → `prompts/list` →
`prompts/get` sequence, since exercising the actual MCP protocol handshake through mocks would
mostly test the SDK itself rather than this app's code.

## Out of scope

- No authentication (explicitly planned as a future addition; stateless design chosen partly
  to keep that addition simple).
- No MCP resources or tools — prompts only, per the request.
- No cursor-based pagination of `prompts/list` (capped at 100 rows).
- No stateful sessions / `Mcp-Session-Id` support.
- No changes to the existing `/api/prompts` REST API.
