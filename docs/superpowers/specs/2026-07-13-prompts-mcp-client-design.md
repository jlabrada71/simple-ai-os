# Prompts MCP Client Design

## Purpose

Add a reusable browser-side MCP client module for the prompts MCP server (`POST /mcp`), so
other app code can connect, list, and get prompts over the Model Context Protocol without
re-implementing the connect/transport boilerplate each time. Mirrors the role
`app/lib/streaming.ts` already plays for the streaming chat endpoint: a plain module of
exported functions, no Vue/component code, imported by pages as needed.

No page/UI is wired up to this module yet — that's left for a future change.

## SDK choice

`@modelcontextprotocol/sdk@1.29.0` (already a dependency, added for the server side). Uses the
same `Client` / `StreamableHTTPClientTransport` API shown in the reference examples
(`examples/guides/clients/connect.examples.ts` and `calling.examples.ts` in the SDK repo),
confirmed against this app's installed 1.29.0 version's type declarations.

## File

### `app/lib/mcp-client.ts`

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

- **Connection caching**: `connectPromptsClient` lazily connects once and caches the `Client`
  instance at module scope; subsequent calls to `listMcpPrompts`/`getMcpPrompt` reuse the same
  connection. Calling `disconnectPromptsClient` clears the cache, so the next call reconnects.
- **Same-origin URL**: the server URL is always `window.location.origin + '/mcp'` — no
  configuration needed, works unmodified across dev/Docker/prod. This makes the module
  browser-only (it references `window`), consistent with `app/lib/streaming.ts`'s existing
  browser-only design (`$fetch({ responseType: 'stream' })`).
- **Exported surface**: `connectPromptsClient`, `listMcpPrompts`, `getMcpPrompt`,
  `disconnectPromptsClient`. `getMcpPrompt`'s `args` parameter maps directly onto the
  `{{variable}}` substitution already implemented server-side
  (`server/lib/mcp-prompts.ts`'s `interpolate`).

## Testing

No dedicated unit tests. Reasoning: this module is a thin wrapper around the MCP SDK's client
(connect, list, get, close) with no branching logic of its own — the substantive behavior
being wrapped is already covered by the SDK's own tests and by this app's server-side MCP
tests/manual verification. Unit-testing it here would mean mocking `window`, `fetch`, and the
full MCP handshake, which would mostly test the mocks rather than this code. Verified manually
instead (see the implementation plan's verification task): a real browser session connects,
lists prompts, gets one with a substituted argument, and disconnects successfully against the
running `/mcp` server.

## Out of scope

- No page/UI wired up to this module.
- No reconnect/retry logic beyond the simple "reconnect on next call after disconnect".
- No support for stdio or SSE-fallback transports — Streamable HTTP only, matching the server.
- No auth (consistent with the rest of the prompts stack; noted previously as a future
  addition).
