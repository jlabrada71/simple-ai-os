# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Nuxt 4 tutorial app demonstrating how to build a chat UI backed by the Anthropic (Claude) SDK, including both
non-streaming and streaming response patterns. It is a learning/reference project, not production software —
expect scaffolding-quality code (missing error handling, hardcoded prompts, duplicate logic between the
streaming/non-streaming variants) left intentionally for teaching purposes.

## Commands

- `npm run dev` — start the Nuxt dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run generate` — static site generation
- `npm run preview` — preview a production build locally
- `npx eslint .` — lint (uses `@nuxt/eslint`'s generated flat config in `.nuxt/eslint.config.mjs`; run `npm run dev` or `postinstall` first if `.nuxt/` doesn't exist yet)

There is no test suite configured despite `@nuxt/test-utils` being a dependency.

## Environment

- `ANTHROPIC_API_KEY` must be set in `.env` for any Claude API calls to succeed (see `server/lib/agent.ts` /
  `server/lib/agent-streaming.ts`).

## Architecture

**Nuxt 4 directory layout**: app code lives under `app/` (pages, layouts, components, client-side lib), server
code lives under `server/` (Nitro API routes + server-only lib). This split matters for auto-imports: composables
like `useStorage`, `defineEventHandler`, `readBody`, `getCookie`, `setCookie`, `sendStream` are Nitro auto-imports
available only in `server/`.

**Two parallel chat implementations** exist side by side as a before/after teaching pair:
- Non-streaming: `app/pages/chat.vue` → `POST /api/agent` (`server/api/agent.post.ts`) → `server/lib/agent.ts`.
  Uses `$fetch` and returns the full assistant response in one shot.
- Streaming: `app/pages/chat-streaming.vue` → `POST /api/agent-stream` (`server/api/agent-stream.post.ts`) →
  `server/lib/agent-streaming.ts`. Uses `app/lib/streaming.ts`'s `streamingFetch` async generator (reads a
  `ReadableStream` via `$fetch({ responseType: 'stream' })` and yields decoded text chunks) to render tokens as
  they arrive. The server side builds a `ReadableStream`, iterates Anthropic's `messages.create({ stream: true })`
  events, and forwards `content_block_delta` text deltas via `sendStream(event, stream)`.

There's also `app/pages/stream-test.vue` + `server/api/stream-test.post.ts`, a minimal reference implementation of
the streaming plumbing (Nitro `ReadableStream` → `sendStream`) with no LLM involved — useful as the simplest
possible example of the streaming mechanism before tracing it through the Claude-backed version.

**Session/conversation state**: Nitro's `unstorage` is configured in `nuxt.config.ts` with an `fs` driver mounted
at `./data/sessions` under the `session` storage namespace. Both `agent.ts` and `agent-streaming.ts` load/save a
`{ messages, claudeResponse }` object per `sessionId` via `useStorage('session')`, appending the user message and
the Claude response each turn — this is the entire conversation history mechanism (no database). `session_id` is
set as an httpOnly cookie by `initSession` (`server/lib/session.ts`), which is invoked lazily by the agent
endpoints if no cookie is present, or explicitly via `GET /api/new-thread` / `GET /api/login` to start a fresh
session. Note `initSession` writes to a *different* storage namespace (`assets:sessions`) than the chat history
(`session`) — these are not currently the same store.

**System prompt**: both agent libs hardcode the same "patient math tutor" system prompt independently — if you
change the persona, update both `server/lib/agent.ts` and `server/lib/agent-streaming.ts`.

**Rendering assistant output**: chat pages render assistant messages through `<MDC :value="..." />` (from
`@nuxtjs/mdc`) to support markdown in responses, with custom prose components in `app/components/prose/`.

**i18n**: `@nuxtjs/i18n` is configured with `en` (default), `es`, `pt` locales and `prefix_except_default`
strategy; locale files live in `i18n/locales/`. Not currently wired into the chat pages themselves.

**Styling**: Tailwind CSS v4 via the Vite plugin (`@tailwindcss/vite`), global styles in `app/assets/css/main.css`.
