# Design: API key management UI

## Context

WP-3 added `POST/GET/DELETE /api/api-keys` (`server/lib/apiKeys.ts`) but no frontend — a user
who wants a personal API key has to call the endpoints directly. This is `docs/backlog.md`'s
"API key management UI" item.

## Decision

New page `app/pages/api-keys.vue` (`definePageMeta({ layout: 'app', middleware: 'auth' })`),
following `app/pages/prompts/index.vue`'s established conventions exactly (table list, `$fetch`
directly in `<script setup>`, `errorMessage` ref pattern, `.btn`/`.icon-btn`/`.table-card` CSS
classes already defined there).

- **List**: `GET /api/api-keys` on mount → table of `name` (or "Unnamed key"), `createdAt`,
  `lastUsedAt` ("Never" if null), and a revoke button per row.
- **Create**: a small inline form (optional `name` text input + "Create" button) →
  `POST /api/api-keys`. On success, the returned plaintext `token` is held in a local ref and
  rendered in a dismissible banner above the table — copy button
  (`navigator.clipboard.writeText`), an explicit "this won't be shown again" warning, and a
  "Done" action that clears the token from local state and refreshes the list. The token is
  never persisted anywhere client-side beyond that transient ref.
- **Revoke**: `confirm()` (matching `removePrompt`'s pattern in `prompts/index.vue`) →
  `DELETE /api/api-keys/:id` → refresh the list.
- **Nav**: add an "API Keys" link to `app/layouts/app.vue`'s `.app-nav-links`, alongside "Chat
  Streaming" and "Prompts".

`middleware: 'auth'` is added even though `prompts/index.vue` doesn't have it today (that's a
pre-existing gap in a different page, out of scope here) — this new page follows the more
correct pattern already used by `chat.vue`/`chat-streaming.vue`.

## Out of scope

- Editing/renaming an existing key (create a new one, revoke the old one).
- Any backend change — the endpoints from WP-3 are used as-is.
