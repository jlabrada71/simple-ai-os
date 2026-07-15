# Chat Prompt Picker UI — Design

**Date:** 2026-07-15

## Goal

Wire up a UI in `app/pages/chat-streaming.vue` for invoking a saved prompt (instead of only free text),
using the `ChatRequest` plumbing (`shared/types/chat.ts`, `server/lib/agent-streaming.ts`) and the
browser MCP client (`app/lib/mcp-client.ts`) built in the prior two refactors.

## Out of scope

- No changes to `app/lib/mcp-client.ts`, `shared/types/chat.ts`, `server/api/agent-stream.post.ts`, or
  `server/lib/agent-streaming.ts` — all needed plumbing already exists.
- No changes to `chat.vue` (non-streaming chat) or the `/prompts` admin pages.
- No client-side prompt-content preview/interpolation — the interpolated text is only ever computed
  server-side (`resolvePromptText` in `server/lib/agent-streaming.ts`).

## Data source

On mount, `chat-streaming.vue` calls `listMcpPrompts()` from `app/lib/mcp-client.ts` and stores the
result in a `ref<McpPrompt[]>`. Each entry has the shape the MCP SDK returns from `prompts/list`:

```ts
{
  name: string
  description?: string
  arguments?: { name: string; description?: string; required?: boolean }[]
}
```

(`server/mcp/server.ts` registers every prompt's variables as `z.string().optional()`, so `required` is
always `undefined`/falsy today — the picker does not enforce required fields.)

If `listMcpPrompts()` throws (e.g. the in-browser MCP connection fails), the error is logged via
`console.error` and the prompts list stays empty — the picker then only offers "Free text", matching the
existing `streamingFetch` try/catch style (no new error-handling abstraction).

## UI structure

A `<select>` control is added above the existing form, bound to a `mode` ref:
- `mode.value === 'text'` (default) — the textarea renders exactly as today.
- `mode.value === <promptName>` — the textarea is replaced by one labeled `<input type="text">` per
  entry in that prompt's `arguments` array, two-way bound into a `promptParams` reactive object keyed by
  argument name (e.g. `promptParams.name`).

Switching `mode` resets `promptParams` to `{}` so stale values from a previously selected prompt don't
leak into a different prompt's fields.

## Send flow

`sendMessage` branches on `mode.value`:

- **`'text'`**: unchanged from today — builds `{ type: 'text', text: userInput.value }`, adds a user
  chat bubble showing `userInput.value` verbatim, clears `userInput`.
- **prompt mode**: builds `{ type: 'prompt', name: mode.value, parameters: { ...promptParams } }`. The
  user chat bubble shows `Prompt: <name> (<key>: <value>, <key2>: <value2>, ...)`, or just
  `Prompt: <name>` when `promptParams` has no entries. After sending, resets `mode.value = 'text'` and
  `promptParams = {}` — mirroring how the textarea already clears after every send.

In both branches, the existing `streamingFetch(url, request)` call and assistant-message-accumulation
loop are unchanged — only how `request` gets built changes.

## Files touched

- `app/pages/chat-streaming.vue` (only file changed)

## Testing

No dedicated unit tests — this is Vue template/reactive-state wiring in a teaching-scaffold page with no
branching logic worth isolating (consistent with `CLAUDE.md`'s note that this project has no test suite
for UI). Verified manually against the running stack: confirm the picker lists seeded prompts, confirm
selecting a prompt swaps in parameter inputs, confirm sending a prompt produces the expected interpolated
assistant reply (proving `parameters` reached the server correctly), and confirm switching back to
"Free text" still sends a normal message.
