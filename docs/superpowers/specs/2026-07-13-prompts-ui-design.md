# Prompts Management UI Design

## Purpose

Add a UI for managing prompts (list, create, edit, delete) on top of the existing
`/api/prompts` CRUD API (`docs/superpowers/specs/2026-07-13-prompts-api-design.md`). The
existing API has no DELETE endpoint — this change adds one, since the UI requires it.

## Server addition: DELETE endpoint

### `server/lib/prompts.ts`

Add:
```ts
export async function deletePrompt(id: string): Promise<Prompt | null> {
  const [row] = await db.delete(prompts).where(eq(prompts.id, id)).returning()
  return row ?? null
}
```

### `server/api/prompts/[id].delete.ts`

```ts
import { deletePrompt } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const prompt = await deletePrompt(id)
  if (!prompt) {
    throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })
  }
  return prompt
})
```

Hard delete (no soft-delete/undo). Returns the deleted row on success. 404 if the id doesn't
exist. A unit test is added to `server/lib/prompts.test.ts` for `deletePrompt`, mocking `db`
the same way `createPrompt`'s test does (chainable `delete().where().returning()`).

## UI routes

Three new pages under `app/pages/prompts/`, following this app's existing file-based routing
and plain-Tailwind, `<script setup>`, `$fetch`-per-page style (see `app/pages/chat.vue`). No
component library, no shared state store — each page owns its local `ref`s and fetches what
it needs.

### `app/pages/prompts/index.vue` — list

- On mount (and whenever `offset`/`tag` change), calls `GET /api/prompts?limit=20&offset=<offset>&tag=<tag>`.
- Renders a table: Name, Description, Tags, Version, Updated At, and an Actions column with
  "Edit" (`NuxtLink` to `/prompts/:id`) and "Delete" (button).
- A text input above the table filters by tag; typing and pressing Enter (or a "Filter" button)
  re-fetches with `offset` reset to 0.
- Pagination: "Previous" (disabled when `offset === 0`) and "Next" (disabled when the response
  returned fewer than `limit` rows) buttons adjust `offset` by `±limit` and re-fetch.
- A "New Prompt" `NuxtLink` to `/prompts/new`.
- Delete button: `confirm('Delete prompt "<name>"? This cannot be undone.')` — if confirmed,
  calls `DELETE /api/prompts/:id`, then re-fetches the current page of the list. On failure,
  shows an inline error message above the table.

### `app/pages/prompts/new.vue` — create

- Form fields: `name` (text, required), `content` (textarea, required), `description` (text,
  optional), `tags` (text, comma-separated, optional), `variables` (text, comma-separated,
  optional).
- On submit: splits `tags`/`variables` on `,`, trims each entry, drops empty strings, and
  `POST`s `{ name, content, description, tags, variables }` (omitting `description`/`tags`/
  `variables` when they resolve to empty) to `/api/prompts`.
- On success: `navigateTo('/prompts')`.
- On failure: shows the API's error message inline (e.g. 409 "A prompt with this name already
  exists", or 400 validation message) above the form; form values are preserved so the user can
  fix and resubmit.

### `app/pages/prompts/[id].vue` — edit

- On mount: `GET /api/prompts/:id` to populate the form (same fields as the create form,
  joining `tags`/`variables` arrays back into comma-separated strings for display). If the
  fetch 404s, shows "Prompt not found" with a link back to `/prompts`.
- "Save" button: same submit logic as create, but `PUT`s to `/api/prompts/:id`; on success,
  `navigateTo('/prompts')`.
- "Delete" button: same `confirm()` + `DELETE` flow as the list page's row-level delete; on
  success, `navigateTo('/prompts')`.
- Displays the current `version` read-only (e.g. "Version 3") so users can see it increment
  after a save.

## Navigation

`app/pages/index.vue` gains a fourth link alongside Chat Streaming / Stream Test / Chat:
```html
<NuxtLink to="/prompts" class="p-2 rounded bg-yellow-300">Prompts</NuxtLink>
```

## Error handling

All three pages catch `$fetch` errors (Nitro's `createError` responses surface as
`FetchError` with `.data.statusMessage` / `.data.message`) and display the message in a plain
`<p class="text-red-600">` above the relevant form/table. No toast/notification system —
consistent with this project's minimal-scaffolding posture.

## Out of scope

- No client-side form validation library — relies on the API's zod validation and displays
  its error messages.
- No optimistic UI updates — every mutation re-fetches from the server after completion.
- No bulk delete / bulk actions.
- No i18n wiring for these pages (the rest of the chat UI doesn't use it either, despite
  `@nuxtjs/i18n` being configured).
- No tag-chip input component — comma-separated text only.
