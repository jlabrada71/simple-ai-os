# Design: tenant-scoped, bearer-authenticated MCP (WP-5)

## Context

`/mcp` (`server/routes/mcp.post.ts`) already scopes prompt exposure to the resolved tenant (via
`event.context.tenant` → `withTenantDb(...)` → `createMcpServer(db)`), but has no authentication
at all — a manual `if (!tenant) throw 404` is the only check. Anyone who can reach a tenant's
subdomain can read that tenant's entire prompt library over MCP. This is `docs/backlog.md`'s
WP-5 item.

The per-user API key system built for WP-3 (`server/lib/apiKeys.ts`,
`server/utils/requireTenantSession.ts`'s `Authorization: Bearer` path) is already exactly what
WP-5 asked for, and every other tenant-scoped endpoint (prompts, agent, agent-stream, threads)
already goes through that same guard.

## Decision

Replace `mcp.post.ts`'s manual tenant check with `requireTenantSession(event)` — the same guard
used everywhere else. This requires a valid `Authorization: Bearer sao_...` token or a browser
session cookie (unchanged tenant-resolution/404 behavior for an unknown tenant; unauthenticated
requests now get 401 instead of reaching `createMcpServer`). `GET`/`DELETE`/`OPTIONS` on `/mcp`
are untouched — they already reject (405) or no-op (204 for CORS preflight) without touching
tenant data. The in-process MCP call from `agent-streaming.ts`'s `resolvePromptText` (used by the
chat prompt-picker) is unaffected — it never goes through HTTP, so it's already covered by the
outer chat request's own `requireTenantSession` call.

No new auth mechanism, no MCP-client-specific restriction (session cookies remain accepted too,
consistent with every other endpoint) — this is a straight reuse of existing infrastructure.

## Testing

- Manual verification against a running server + provisioned tenant + minted API key: confirm an
  unauthenticated `POST /mcp` now 401s, and a request with a valid `Authorization: Bearer` header
  succeeds and returns only that tenant's prompts (mirroring the phase-1/phase-2/WP-3 pattern of
  verifying against a real server rather than only mocks, since MCP's session-based
  `StreamableHTTPServerTransport` handshake isn't easily unit-testable).

## Out of scope

- Any change to `GET`/`DELETE`/`OPTIONS` /mcp handlers.
- Any change to the internal (non-HTTP) MCP call path used by the chat prompt picker.
- Restricting MCP specifically to API-key auth (session cookies remain valid too).
