# Prompts Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/prompts` UI (list with pagination/tag filter, create, edit, delete) on top of the existing `/api/prompts` CRUD API, adding the missing DELETE endpoint along the way.

**Architecture:** One new server route (`DELETE /api/prompts/:id`) backed by a new `deletePrompt` lib function, plus three new Nuxt pages under `app/pages/prompts/` using plain `<script setup>`, Tailwind utility classes, and `$fetch` — matching the existing `app/pages/chat.vue` style. No component library, no shared state store.

**Tech Stack:** Existing Nuxt 4 / Nitro / Vue stack; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-13-prompts-ui-design.md`

---

### Task 1: Add `deletePrompt` to the prompts lib (TDD)

**Files:**
- Modify: `server/lib/prompts.ts`
- Modify: `server/lib/prompts.test.ts`

- [ ] **Step 1: Extend the existing `db` mock to support `delete()` and write the failing test**

In `server/lib/prompts.test.ts`, replace the existing `vi.mock('../db/client', ...)` block at the top of the file:

```ts
vi.mock('../db/client', () => {
  const returning = vi.fn()
  const values = vi.fn(() => ({ returning }))
  const insert = vi.fn(() => ({ values }))

  const deleteReturning = vi.fn()
  const deleteWhere = vi.fn(() => ({ returning: deleteReturning }))
  const del = vi.fn(() => ({ where: deleteWhere }))

  return { db: { insert, delete: del } }
})
```

Then append a new `describe` block at the bottom of the file:

```ts
describe('deletePrompt', () => {
  it('deletes the row and returns it', async () => {
    const { db } = await import('../db/client')
    const { deletePrompt } = await import('./prompts')

    const fakeRow = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'greeting',
      content: 'Hello!',
      description: null,
      tags: [],
      variables: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    ;(db.delete as any)().where().returning.mockResolvedValue([fakeRow])

    const result = await deletePrompt(fakeRow.id)

    expect(result).toEqual(fakeRow)
  })

  it('returns null when nothing was deleted', async () => {
    const { db } = await import('../db/client')
    const { deletePrompt } = await import('./prompts')

    ;(db.delete as any)().where().returning.mockResolvedValue([])

    const result = await deletePrompt('00000000-0000-0000-0000-000000000000')

    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to confirm the new ones fail**

Run: `npm test -- server/lib/prompts.test.ts`
Expected: FAIL — `deletePrompt` is not exported from `./prompts` yet.

- [ ] **Step 3: Add `deletePrompt` to `server/lib/prompts.ts`**

Append to the bottom of `server/lib/prompts.ts`:

```ts
export async function deletePrompt(id: string): Promise<Prompt | null> {
  const [row] = await db.delete(prompts).where(eq(prompts.id, id)).returning()
  return row ?? null
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test`
Expected: PASS — all 19 tests green (17 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add server/lib/prompts.ts server/lib/prompts.test.ts
git commit -m "feat: add deletePrompt to prompts lib"
```

---

### Task 2: Add the DELETE route handler

**Files:**
- Create: `server/api/prompts/[id].delete.ts`

- [ ] **Step 1: Create the route handler**

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

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — 19 tests green (this route handler has no dedicated test, same rationale as the other thin route handlers: no branching logic beyond what `deletePrompt` already covers).

- [ ] **Step 3: Commit**

```bash
git add server/api/prompts/\[id\].delete.ts
git commit -m "feat: add DELETE /api/prompts/:id route"
```

---

### Task 3: Prompts list page

**Files:**
- Create: `app/pages/prompts/index.vue`

- [ ] **Step 1: Create the list page**

```vue
<template>
  <div class="max-w-5xl mx-auto p-4">
    <div class="flex items-center justify-between py-4">
      <h1 class="text-2xl font-bold">Prompts</h1>
      <NuxtLink to="/prompts/new" class="bg-blue-300 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded">
        New Prompt
      </NuxtLink>
    </div>

    <form @submit.prevent="applyFilter" class="flex gap-2 mb-4">
      <input v-model="tagFilter" type="text" placeholder="Filter by tag..." class="border rounded p-2 flex-1" />
      <button type="submit" class="bg-gray-200 hover:bg-gray-300 font-bold py-2 px-4 rounded">Filter</button>
    </form>

    <p v-if="errorMessage" class="text-red-600 mb-4">{{ errorMessage }}</p>

    <table class="w-full bg-white rounded-lg shadow-md">
      <thead>
        <tr class="text-left border-b">
          <th class="p-2">Name</th>
          <th class="p-2">Description</th>
          <th class="p-2">Tags</th>
          <th class="p-2">Version</th>
          <th class="p-2">Updated</th>
          <th class="p-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="prompt in prompts" :key="prompt.id" class="border-b">
          <td class="p-2">{{ prompt.name }}</td>
          <td class="p-2">{{ prompt.description }}</td>
          <td class="p-2">{{ prompt.tags.join(', ') }}</td>
          <td class="p-2">{{ prompt.version }}</td>
          <td class="p-2">{{ new Date(prompt.updatedAt).toLocaleString() }}</td>
          <td class="p-2 flex gap-2">
            <NuxtLink :to="`/prompts/${prompt.id}`" class="text-blue-600 hover:underline">Edit</NuxtLink>
            <button @click="removePrompt(prompt)" class="text-red-600 hover:underline">Delete</button>
          </td>
        </tr>
        <tr v-if="prompts.length === 0">
          <td class="p-4 text-center text-gray-500" colspan="6">No prompts found.</td>
        </tr>
      </tbody>
    </table>

    <div class="flex justify-between mt-4">
      <button
        @click="previousPage"
        :disabled="offset === 0"
        class="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 font-bold py-2 px-4 rounded"
      >
        Previous
      </button>
      <button
        @click="nextPage"
        :disabled="!hasNextPage"
        class="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 font-bold py-2 px-4 rounded"
      >
        Next
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const limit = 20
const offset = ref(0)
const tagFilter = ref('')
const prompts = ref([])
const hasNextPage = ref(false)
const errorMessage = ref('')

const fetchPrompts = async () => {
  errorMessage.value = ''
  try {
    const query = { limit, offset: offset.value }
    if (tagFilter.value.trim()) {
      query.tag = tagFilter.value.trim()
    }
    const response = await $fetch('/api/prompts', { query })
    prompts.value = response.prompts
    hasNextPage.value = response.prompts.length === limit
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to load prompts'
  }
}

const applyFilter = () => {
  offset.value = 0
  fetchPrompts()
}

const previousPage = () => {
  offset.value = Math.max(0, offset.value - limit)
  fetchPrompts()
}

const nextPage = () => {
  offset.value += limit
  fetchPrompts()
}

const removePrompt = async (prompt) => {
  if (!confirm(`Delete prompt "${prompt.name}"? This cannot be undone.`)) return
  errorMessage.value = ''
  try {
    await $fetch(`/api/prompts/${prompt.id}`, { method: 'DELETE' })
    fetchPrompts()
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to delete prompt'
  }
}

fetchPrompts()
</script>
```

- [ ] **Step 2: Commit**

```bash
git add app/pages/prompts/index.vue
git commit -m "feat: add prompts list page with pagination and tag filter"
```

---

### Task 4: Create-prompt page

**Files:**
- Create: `app/pages/prompts/new.vue`

- [ ] **Step 1: Create the page**

```vue
<template>
  <div class="max-w-2xl mx-auto p-4">
    <h1 class="text-2xl font-bold py-4">New Prompt</h1>

    <p v-if="errorMessage" class="text-red-600 mb-4">{{ errorMessage }}</p>

    <form @submit.prevent="submit" class="flex flex-col gap-4 bg-white rounded-lg shadow-md p-4">
      <label class="flex flex-col gap-1">
        <span class="font-bold">Name</span>
        <input v-model="name" type="text" required class="border rounded p-2" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="font-bold">Content</span>
        <textarea v-model="content" required rows="6" class="border rounded p-2"></textarea>
      </label>

      <label class="flex flex-col gap-1">
        <span class="font-bold">Description</span>
        <input v-model="description" type="text" class="border rounded p-2" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="font-bold">Tags (comma-separated)</span>
        <input v-model="tags" type="text" class="border rounded p-2" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="font-bold">Variables (comma-separated)</span>
        <input v-model="variables" type="text" class="border rounded p-2" />
      </label>

      <div class="flex gap-2">
        <button type="submit" class="bg-blue-300 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded">
          Create
        </button>
        <NuxtLink to="/prompts" class="bg-gray-200 hover:bg-gray-300 font-bold py-2 px-4 rounded">
          Cancel
        </NuxtLink>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const name = ref('')
const content = ref('')
const description = ref('')
const tags = ref('')
const variables = ref('')
const errorMessage = ref('')

const splitList = (value) =>
  value.split(',').map((item) => item.trim()).filter((item) => item.length > 0)

const submit = async () => {
  errorMessage.value = ''
  const body = { name: name.value, content: content.value }
  if (description.value.trim()) body.description = description.value.trim()
  const tagList = splitList(tags.value)
  if (tagList.length > 0) body.tags = tagList
  const variableList = splitList(variables.value)
  if (variableList.length > 0) body.variables = variableList

  try {
    await $fetch('/api/prompts', { method: 'POST', body })
    await navigateTo('/prompts')
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to create prompt'
  }
}
</script>
```

- [ ] **Step 2: Commit**

```bash
git add app/pages/prompts/new.vue
git commit -m "feat: add create-prompt page"
```

---

### Task 5: Edit-prompt page

**Files:**
- Create: `app/pages/prompts/[id].vue`

- [ ] **Step 1: Create the page**

```vue
<template>
  <div class="max-w-2xl mx-auto p-4">
    <h1 class="text-2xl font-bold py-4">Edit Prompt</h1>

    <p v-if="notFound" class="text-red-600">
      Prompt not found. <NuxtLink to="/prompts" class="underline">Back to prompts</NuxtLink>
    </p>

    <template v-else>
      <p v-if="errorMessage" class="text-red-600 mb-4">{{ errorMessage }}</p>
      <p class="text-gray-500 mb-2">Version {{ version }}</p>

      <form @submit.prevent="submit" class="flex flex-col gap-4 bg-white rounded-lg shadow-md p-4">
        <label class="flex flex-col gap-1">
          <span class="font-bold">Name</span>
          <input v-model="name" type="text" required class="border rounded p-2" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="font-bold">Content</span>
          <textarea v-model="content" required rows="6" class="border rounded p-2"></textarea>
        </label>

        <label class="flex flex-col gap-1">
          <span class="font-bold">Description</span>
          <input v-model="description" type="text" class="border rounded p-2" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="font-bold">Tags (comma-separated)</span>
          <input v-model="tags" type="text" class="border rounded p-2" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="font-bold">Variables (comma-separated)</span>
          <input v-model="variables" type="text" class="border rounded p-2" />
        </label>

        <div class="flex gap-2">
          <button type="submit" class="bg-blue-300 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded">
            Save
          </button>
          <button
            type="button"
            @click="remove"
            class="bg-red-300 hover:bg-red-400 text-white font-bold py-2 px-4 rounded"
          >
            Delete
          </button>
          <NuxtLink to="/prompts" class="bg-gray-200 hover:bg-gray-300 font-bold py-2 px-4 rounded">
            Cancel
          </NuxtLink>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const route = useRoute()
const id = route.params.id

const name = ref('')
const content = ref('')
const description = ref('')
const tags = ref('')
const variables = ref('')
const version = ref(1)
const errorMessage = ref('')
const notFound = ref(false)

const splitList = (value) =>
  value.split(',').map((item) => item.trim()).filter((item) => item.length > 0)

const load = async () => {
  try {
    const prompt = await $fetch(`/api/prompts/${id}`)
    name.value = prompt.name
    content.value = prompt.content
    description.value = prompt.description || ''
    tags.value = prompt.tags.join(', ')
    variables.value = prompt.variables.join(', ')
    version.value = prompt.version
  } catch (err) {
    if (err.statusCode === 404) {
      notFound.value = true
    } else {
      errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to load prompt'
    }
  }
}

const submit = async () => {
  errorMessage.value = ''
  const body = {
    name: name.value,
    content: content.value,
    description: description.value.trim() || undefined,
    tags: splitList(tags.value),
    variables: splitList(variables.value),
  }

  try {
    const prompt = await $fetch(`/api/prompts/${id}`, { method: 'PUT', body })
    version.value = prompt.version
    await navigateTo('/prompts')
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to save prompt'
  }
}

const remove = async () => {
  if (!confirm(`Delete prompt "${name.value}"? This cannot be undone.`)) return
  errorMessage.value = ''
  try {
    await $fetch(`/api/prompts/${id}`, { method: 'DELETE' })
    await navigateTo('/prompts')
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to delete prompt'
  }
}

load()
</script>
```

- [ ] **Step 2: Commit**

```bash
git add app/pages/prompts/\[id\].vue
git commit -m "feat: add edit-prompt page with delete"
```

---

### Task 6: Add navigation link

**Files:**
- Modify: `app/pages/index.vue`

- [ ] **Step 1: Add the Prompts link**

In `app/pages/index.vue`, change:
```html
    <div class="flex gap-4">    
        <NuxtLink to="/chat-streaming" class="p-2 rounded bg-blue-300">Chat Streaming</NuxtLink>
        <NuxtLink to="/stream-test" class="p-2 rounded bg-green-300">Stream Test</NuxtLink>
        <NuxtLink to="/chat" class="p-2 rounded bg-purple-300">Chat</NuxtLink>
    </div>
```
to:
```html
    <div class="flex gap-4">    
        <NuxtLink to="/chat-streaming" class="p-2 rounded bg-blue-300">Chat Streaming</NuxtLink>
        <NuxtLink to="/stream-test" class="p-2 rounded bg-green-300">Stream Test</NuxtLink>
        <NuxtLink to="/chat" class="p-2 rounded bg-purple-300">Chat</NuxtLink>
        <NuxtLink to="/prompts" class="p-2 rounded bg-yellow-300">Prompts</NuxtLink>
    </div>
```

- [ ] **Step 2: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat: add Prompts link to home nav"
```

---

### Task 7: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the stack**

Run: `docker compose up -d --build -V postgres dev` (the `-V` recreates the anonymous `node_modules` volume in case dependencies changed; harmless if they didn't)

- [ ] **Step 2: Confirm the app is up**

Run: `sleep 5 && curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000`
Expected: `200`

- [ ] **Step 3: Confirm the full test suite still passes**

Run: `npm test`
Expected: PASS — 19 tests green.

- [ ] **Step 4: Browser walkthrough**

Using a browser (or Chrome DevTools MCP if available):
1. Visit `http://localhost:3000/` — confirm a "Prompts" link is present and navigates to `/prompts`.
2. On `/prompts`, confirm the table renders (empty state "No prompts found." if the table is empty).
3. Click "New Prompt", fill in Name=`math-tutor`, Content=`Guide the student step by step.`, Tags=`math, tutoring`, submit. Confirm redirect to `/prompts` and the new row appears with the right tags.
4. Click "Edit" on that row, change Content, Save. Confirm redirect to `/prompts` and — by clicking Edit again — that Version is now `2` and content reflects the change.
5. Click "Delete" on the row, confirm the browser `confirm()` dialog, accept it. Confirm the row disappears and no error is shown.
6. Attempt to create two prompts with the same `name`; confirm the second attempt shows the 409 error message inline on `/prompts/new` without navigating away.
7. Attempt to submit the create form with an empty Name; confirm the browser's native `required` validation blocks submission (no request sent).

- [ ] **Step 5: Tear down**

Run: `docker compose down`

---

## Self-Review Notes

- **Spec coverage:** DELETE endpoint (Tasks 1-2), list/pagination/tag-filter (Task 3), create (Task 4), edit + delete (Task 5), nav link (Task 6), error handling via inline messages (all three pages), out-of-scope items (no validation library, no optimistic updates, no bulk actions, no i18n, no tag-chip input) correctly excluded.
- **Type consistency:** `deletePrompt` signature (`(id: string) => Promise<Prompt | null>`) matches the pattern of `getPrompt`/`updatePrompt` already in `server/lib/prompts.ts`. Field names used in the UI (`name`, `content`, `description`, `tags`, `variables`, `version`, `updatedAt`) match the Drizzle schema's camelCase columns exactly as returned by the API's JSON responses.
- **No placeholders:** all steps contain complete, runnable code.
