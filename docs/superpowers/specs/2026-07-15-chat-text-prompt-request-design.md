# Chat Text/Prompt Request Refactor — Design

**Date:** 2026-07-15

## Goal

Refactor the streaming chat client (`app/pages/chat-streaming.vue` → `app/lib/streaming.ts`) and the
streaming chat server (`server/api/agent-stream.post.ts` → `server/lib/agent-streaming.ts`) so a chat
turn is sent as one of two typed request objects instead of a bare `{ message: string }`:

1. **`text`** — the free-form text the user typed.
2. **`prompt`** — a saved prompt the user invoked by name, with its parameter values.

Non-streaming chat (`chat.vue` / `server/lib/agent.ts`) is out of scope.

## Out of scope

- No UI for picking a saved prompt in `chat-streaming.vue`. `sendMessage` will only ever construct a
  `text` request for now; the `prompt` branch exists in the type/server plumbing so a future UI can use
  it without another server-side refactor.
- No changes to `chat.vue` / `server/lib/agent.ts` (the non-streaming pair).

## Shared type & schema

New file `shared/types/chat.ts`. Nuxt 4's `shared/` directory auto-imports into both `app/` and
`server/`, so this is the single source of truth for the request shape on both sides — no duplicated
type definitions.

```ts
import { z } from 'zod'

export const chatRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().trim().min(1) }),
  z.object({
    type: z.literal('prompt'),
    name: z.string().trim().min(1),
    parameters: z.record(z.string()).optional(),
  }),
])

export type ChatRequest = z.infer<typeof chatRequestSchema>
```

## Client changes

**`app/lib/streaming.ts`**

`streamingFetch(url, message: string)` becomes `streamingFetch(url, request: ChatRequest)`. The
`ChatRequest` object is sent directly as the JSON body (replacing the current `{ message }` wrapper).
The read-loop/decoding logic is unchanged.

**`app/pages/chat-streaming.vue`**

`sendMessage` builds `{ type: 'text', text: userInput.value }` and passes it to `streamingFetch`
instead of the raw string. Display logic (`messages`, `MDC` rendering) is unchanged — only the request
construction changes.

## Server changes

**`server/api/agent-stream.post.ts`**

Parses the request body with `chatRequestSchema.parse(...)` instead of reading `body.message`
directly, and passes the validated `ChatRequest` to `chat(sessionId, request)`.

**`server/lib/agent-streaming.ts`**

- **Remove dead scaffolding:** the module-level `mcpClient` (a `StdioClientTransport` pointing at a
  nonexistent `../mcp/server.ts`) and the matching `mcp_servers`/stdio block inside
  `client.messages.create(...)`. Both are non-functional leftovers unrelated to the real prompts MCP
  server (`server/mcp/server.ts`, served over `/mcp`); nothing currently depends on them working.
- **Add `resolvePromptText(name, parameters)`:** builds an in-process MCP client using
  `InMemoryTransport.createLinkedPair()`, connects one end to `createMcpServer()` (from
  `server/mcp/server.ts`) and a `Client` to the other end, calls
  `client.getPrompt({ name, arguments: parameters })`, extracts the interpolated text from
  `messages[0].content.text`, and closes the client. This reuses the real prompt registry/interpolation
  logic (`listPrompts` + `interpolate`) without a network hop — no host/port to guess from server-side
  code, unlike the browser's `StreamableHTTPClientTransport`.
- **`chat(sessionId, request: ChatRequest)`** (renamed parameter from `userMessage: string`):
  resolves a single `userMessageText: string` up front — `request.text` when `request.type === 'text'`,
  or `await resolvePromptText(request.name, request.parameters)` when `request.type === 'prompt'` —
  then proceeds exactly as today: `addUserMessage(messages, userMessageText)`, the Claude streaming
  call, and the session save. The rest of the function body is unchanged.

## Error handling

If `resolvePromptText` is called with a prompt name that doesn't exist, `getPrompt` will throw (MCP SDK
default behavior for an unregistered prompt). This propagates out of `chat()` and is not caught —
consistent with the rest of this file's "teaching scaffold, no error handling" style noted in
`CLAUDE.md`. Not adding new error handling here since the prompt-invocation path has no UI yet to
trigger it with a bad name.

## Testing

- `chatRequestSchema` gets unit tests in a new `shared/types/chat.test.ts` (or colocated with the
  server tests, matching the style of `server/lib/prompts.test.ts`'s schema tests) — valid `text`,
  valid `prompt` with/without `parameters`, and rejection cases (empty `text`, empty `name`, wrong
  `type` literal, missing `type`). No DB or network involved.
- `resolvePromptText` and `chat()` are not practically unit-testable — `resolvePromptText` runs the
  real `createMcpServer()` (hits Postgres via `listPrompts`), and `chat()` additionally calls the real
  Anthropic API. Verified manually against the running docker stack: seed a prompt, send a `prompt`-type
  request through `/api/agent-stream`, confirm the interpolated text reaches Claude and the streamed
  response comes back — same pattern used for the prior MCP-client verification
  (`docs/superpowers/plans/2026-07-13-prompts-mcp-client.md`, Task 2).

## Files touched

- `shared/types/chat.ts` (new)
- `shared/types/chat.test.ts` (new)
- `app/lib/streaming.ts`
- `app/pages/chat-streaming.vue`
- `server/api/agent-stream.post.ts`
- `server/lib/agent-streaming.ts`
