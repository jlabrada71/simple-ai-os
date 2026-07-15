# Chat-Streaming & Prompts Pages Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `app/pages/chat-streaming.vue` and the three prompts pages
(`app/pages/prompts/index.vue`, `new.vue`, `[id].vue`) to match the Stitch-generated design system already
used by `app/pages/index.vue`, add a shared top-nav layout, and cover both flows with Playwright specs.

**Architecture:** A small set of CSS custom properties (colors, spacing, radii, fonts) — the same values
`index.vue` already keeps in its own scoped style — move into a `:root` block in the global
`app/assets/css/main.css` so every restyled page/layout can reference them without redeclaring hex values.
A new `app/layouts/app.vue` layout renders a top nav (logo + Chat Streaming / Prompts links with an
active-route indicator) and is opted into by the four affected pages via `definePageMeta({ layout: 'app'
})`. Each page keeps its existing `<script setup>` logic untouched (same refs, computed properties,
function names) and gets a new template structure + `<style scoped>` block. `index.vue` and
`app/layouts/default.vue` are not modified.

**Tech Stack:** Vue 3 SFC, Nuxt 4 layouts, `@nuxt/icon` (Iconify `material-symbols` collection),
`@playwright/test` (already installed, config at `playwright.config.ts`).

**Spec:** `docs/superpowers/specs/2026-07-15-chat-streaming-prompts-redesign-design.md`

---

### Task 1: Add shared design tokens to `main.css`

**Files:**
- Modify: `app/assets/css/main.css`

- [ ] **Step 1: Replace the full file contents**

```css
@import "tailwindcss";

:root {
  --color-background: #f9f9f9;
  --color-surface-lowest: #ffffff;
  --color-surface-container-low: #f3f3f3;
  --color-surface-container: #eeeeee;
  --color-on-background: #1a1c1c;
  --color-on-surface-variant: #464555;
  --color-outline-variant: #c7c4d8;
  --color-primary: #3525cd;
  --color-primary-container: #4f46e5;
  --color-on-primary: #ffffff;
  --color-secondary: #4648d4;
  --color-secondary-container: #6063ee;
  --color-secondary-fixed: #e1e0ff;
  --color-on-secondary-fixed: #07006c;
  --color-error: #ba1a1a;

  --space-xs: 8px;
  --space-sm: 16px;
  --space-md: 24px;
  --space-lg: 40px;
  --space-xl: 64px;
  --space-margin-mobile: 16px;
  --space-margin-desktop: 48px;
  --max-width: 1280px;

  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-full: 9999px;

  --font-body: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

These are variable declarations only, not utility classes — `index.vue`'s own scoped
`.index-page { --color-primary: #3525cd; ... }` block still locally shadows these on that page's root
element with identical values, so `index.vue` renders exactly as before. No other existing page uses any
of these variable names today, so this is a pure addition with zero visual side effects until Tasks 2-6
consume them.

- [ ] **Step 2: Commit**

```bash
git add app/assets/css/main.css
git commit -m "$(cat <<'EOF'
config: add shared design tokens for chat-streaming and prompts redesign

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create the shared nav layout

**Files:**
- Create: `app/layouts/app.vue`

- [ ] **Step 1: Write the layout file**

```vue
<template>
  <div class="app-shell">
    <header class="app-nav">
      <div class="app-nav-inner">
        <NuxtLink to="/" class="app-logo">Simple AI OS</NuxtLink>
        <nav class="app-nav-links">
          <NuxtLink
            to="/chat-streaming"
            class="app-nav-link"
            :class="{ 'app-nav-link-active': route.path === '/chat-streaming' }"
          >
            Chat Streaming
          </NuxtLink>
          <NuxtLink
            to="/prompts"
            class="app-nav-link"
            :class="{ 'app-nav-link-active': route.path.startsWith('/prompts') }"
          >
            Prompts
          </NuxtLink>
        </nav>
      </div>
    </header>
    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()

useHead({
  link: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400&display=swap',
    },
  ],
})
</script>

<style scoped>
.app-shell {
  display: block;
  min-height: 100vh;
  font-family: var(--font-body);
  color: var(--color-on-background);
  background-color: var(--color-background);
}

.app-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background-color: var(--color-background);
  border-bottom: 1px solid var(--color-outline-variant);
}

.app-nav-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 var(--space-sm);
  height: 72px;
}
@media (min-width: 768px) {
  .app-nav-inner {
    padding: 0 var(--space-margin-desktop);
  }
}

.app-logo {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-primary);
  text-decoration: none;
}

.app-nav-links {
  display: flex;
  gap: var(--space-md);
}

.app-nav-link {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-on-surface-variant);
  text-decoration: none;
  padding-bottom: 4px;
  border-bottom: 2px solid transparent;
}
.app-nav-link:hover {
  color: var(--color-primary);
}
.app-nav-link-active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.app-main {
  width: 100%;
}
</style>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p /mnt/data/sources/simple-ai-os/.nuxt/tsconfig.app.json`
Expected: no errors referencing `app/layouts/app.vue` (run `npm run dev` first if `.nuxt/` doesn't exist
yet, per this repo's README/CLAUDE.md note on the eslint flat config needing the same prerequisite).

- [ ] **Step 3: Commit**

```bash
git add app/layouts/app.vue
git commit -m "$(cat <<'EOF'
feat: add shared nav layout for chat-streaming and prompts pages

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Redesign `chat-streaming.vue`

**Files:**
- Modify: `app/pages/chat-streaming.vue`

- [ ] **Step 1: Replace the full file contents**

```vue
<template>
  <div class="chat-page">
    <div class="chat-panel">
      <div class="chat-panel-header">
        <h1 class="chat-title">Claude Chat</h1>
        <button type="button" class="btn btn-secondary" @click="newThread">New Thread</button>
      </div>

      <div class="chat-messages" ref="chat-area">
        <div
          v-for="(message, index) in messages"
          :key="index"
          class="message-row"
          :class="message.role === 'user' ? 'message-row-user' : 'message-row-assistant'"
        >
          <Icon v-if="message.role !== 'user'" name="material-symbols:smart-toy" class="message-avatar" />
          <div class="bubble" :class="message.role === 'user' ? 'bubble-user' : 'bubble-assistant'">
            <div v-if="message.role === 'user'">{{ message.content }}</div>
            <MDC v-else :value="message.content" :cache-key="`chat-streaming-message-${index}`" />
          </div>
        </div>
      </div>

      <form @submit.prevent="sendMessage" class="chat-form">
        <div class="mode-switch">
          <button
            type="button"
            class="mode-switch-option"
            :class="{ 'mode-switch-option-active': mode === 'text' }"
            @click="mode = 'text'; onModeChange()"
          >
            Free text
          </button>
          <button
            v-for="prompt in availablePrompts"
            :key="prompt.name"
            type="button"
            class="mode-switch-option"
            :class="{ 'mode-switch-option-active': mode === prompt.name }"
            @click="mode = prompt.name; onModeChange()"
          >
            {{ prompt.name }}
          </button>
        </div>

        <div class="chat-input-row">
          <textarea
            v-if="mode === 'text'"
            v-model="userInput"
            placeholder="Type your message..."
            rows="3"
            class="chat-textarea"
          ></textarea>
          <div v-else class="prompt-params">
            <label v-for="arg in (selectedPrompt?.arguments || [])" :key="arg.name" class="field-label">
              <span>{{ arg.name }}</span>
              <input v-model="promptParams[arg.name]" type="text" class="field-input" />
            </label>
          </div>
          <button type="submit" class="send-button" aria-label="Send message">
            <Icon name="material-symbols:send" />
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { streamingFetch } from '../lib/streaming';
import { listMcpPrompts } from '../lib/mcp-client';

definePageMeta({ layout: 'app' })

const userInput = ref('');
const messages = ref([]);
const chatAreaElement = useTemplateRef('chat-area');

const currentAssistantMessage = ref({ role: 'assistant', content: '' });

const mode = ref('text');
const availablePrompts = ref([]);
const promptParams = ref({});

const selectedPrompt = computed(() =>
  availablePrompts.value.find((prompt) => prompt.name === mode.value) || null
);

onMounted(async () => {
  try {
    availablePrompts.value = await listMcpPrompts();
  } catch (error) {
    console.error('Failed to load prompts:', error);
  }
});

const onModeChange = () => {
  promptParams.value = {};
};

const addMessage = (message) => {
  messages.value.push(message);
  scrollToBottom();
};

const scrollToBottom = () => {
  nextTick(() => {
    if (chatAreaElement.value) {
      chatAreaElement.value.scrollTop = chatAreaElement.value.scrollHeight - chatAreaElement.value.clientHeight;
    }
  })
}

const buildPromptBubbleContent = (name, parameters) => {
  const entries = Object.entries(parameters);
  if (entries.length === 0) return `Prompt: ${name}`;
  const paramsText = entries.map(([key, value]) => `${key}: ${value}`).join(', ');
  return `Prompt: ${name} (${paramsText})`;
}

const sendMessage = async () => {
  let request;
  let bubbleContent;

  if (mode.value === 'text') {
    if (!userInput.value.trim()) return
    request = { type: 'text', text: userInput.value };
    bubbleContent = userInput.value;
  } else {
    request = { type: 'prompt', name: mode.value, parameters: { ...promptParams.value } };
    bubbleContent = buildPromptBubbleContent(mode.value, promptParams.value);
  }

  addMessage({ role: 'user', content: bubbleContent });
  messages.value.push(currentAssistantMessage.value);

  const url = '/api/agent-stream';

  for await (const chunk of streamingFetch(url, request)) {
    currentAssistantMessage.value.content += chunk;
  };
  currentAssistantMessage.value = { role: 'assistant', content: '' };

  userInput.value = '';
  mode.value = 'text';
  promptParams.value = {};
}

const newThread = async() => {
  const response = await $fetch('/api/new-thread', {
    method: 'GET',
  })
  userInput.value = ''
  messages.value = [];
}
</script>

<style scoped>
.chat-page {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-md) var(--space-sm);
}
@media (min-width: 768px) {
  .chat-page {
    padding: var(--space-lg) var(--space-margin-desktop);
  }
}

.chat-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 160px);
  min-height: 480px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-lowest);
  overflow: hidden;
}

.chat-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-outline-variant);
}

.chat-title {
  font-size: 20px;
  font-weight: 700;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 8px var(--space-sm);
  border-radius: var(--radius-lg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}
.btn-secondary {
  background-color: var(--color-surface-lowest);
  color: var(--color-on-background);
  border: 1px solid var(--color-outline-variant);
}
.btn-secondary:hover {
  border-color: var(--color-primary-container);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.message-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-xs);
}
.message-row-user {
  justify-content: flex-end;
}
.message-row-assistant {
  justify-content: flex-start;
}

.message-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background-color: var(--color-secondary-fixed);
  color: var(--color-primary);
  padding: 4px;
  box-sizing: border-box;
}

.bubble {
  max-width: 70%;
  padding: var(--space-sm);
  border-radius: var(--radius-lg);
  line-height: 1.5;
}
.bubble-user {
  background-color: var(--color-primary-container);
  color: var(--color-on-primary);
  border-bottom-right-radius: 4px;
}
.bubble-assistant {
  background-color: var(--color-surface-container-low);
  color: var(--color-on-background);
  border-bottom-left-radius: 4px;
}

.chat-form {
  border-top: 1px solid var(--color-outline-variant);
  padding: var(--space-sm) var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.mode-switch {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}
.mode-switch-option {
  padding: 6px var(--space-sm);
  border-radius: var(--radius-full);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-lowest);
  color: var(--color-on-surface-variant);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.mode-switch-option-active {
  background-color: var(--color-primary-container);
  color: var(--color-on-primary);
  border-color: var(--color-primary-container);
}

.chat-input-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-sm);
}

.chat-textarea {
  flex: 1;
  resize: none;
  padding: var(--space-sm);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-container-low);
  font-family: var(--font-body);
}
.chat-textarea:focus {
  outline: none;
  border-color: var(--color-primary-container);
  background-color: var(--color-surface-lowest);
}

.prompt-params {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.field-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-on-background);
}

.field-input {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-container-low);
  font-family: var(--font-body);
  font-weight: 400;
}
.field-input:focus {
  outline: none;
  border-color: var(--color-primary-container);
  background-color: var(--color-surface-lowest);
}

.send-button {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  border: none;
  background-color: var(--color-primary-container);
  color: var(--color-on-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  cursor: pointer;
}
.send-button:hover {
  background-color: var(--color-primary);
}
</style>
```

Note: the original file's `<script setup language="ts">` had a typo (`language` instead of `lang`), which
Vue's SFC compiler ignores — meaning it was silently compiled as plain JS. This rewrite uses the correct
`lang="ts"` attribute. The original template's `@scroll="handleScroll"` bound to a method that was never
defined in the script (dead, always-erroring binding) is dropped since it never did anything.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p /mnt/data/sources/simple-ai-os/.nuxt/tsconfig.app.json`
Expected: no errors referencing `app/pages/chat-streaming.vue`

- [ ] **Step 3: Commit**

```bash
git add app/pages/chat-streaming.vue
git commit -m "$(cat <<'EOF'
feat: redesign chat-streaming page with bubble UI and shared design tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Redesign `prompts/index.vue`

**Files:**
- Modify: `app/pages/prompts/index.vue`

- [ ] **Step 1: Replace the full file contents**

```vue
<template>
  <div class="prompts-page">
    <div class="prompts-header">
      <h1 class="page-title">Prompts</h1>
      <NuxtLink to="/prompts/new" class="btn btn-primary">
        <Icon name="material-symbols:add" />
        New Prompt
      </NuxtLink>
    </div>

    <form @submit.prevent="applyFilter" class="filter-form">
      <input v-model="tagFilter" type="text" placeholder="Filter by tag..." class="filter-input" />
      <button type="submit" class="btn btn-secondary">Filter</button>
    </form>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <div class="table-card">
      <table class="prompts-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Tags</th>
            <th>Version</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="prompt in prompts" :key="prompt.id">
            <td>{{ prompt.name }}</td>
            <td>{{ prompt.description }}</td>
            <td>
              <span v-for="tag in prompt.tags" :key="tag" class="tag-chip">{{ tag }}</span>
            </td>
            <td>{{ prompt.version }}</td>
            <td>{{ new Date(prompt.updatedAt).toLocaleString() }}</td>
            <td class="actions-cell">
              <NuxtLink :to="`/prompts/${prompt.id}`" class="link-edit">Edit</NuxtLink>
              <button type="button" @click="removePrompt(prompt)" class="link-delete">Delete</button>
            </td>
          </tr>
          <tr v-if="prompts.length === 0">
            <td class="empty-cell" colspan="6">No prompts found.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <button @click="previousPage" :disabled="offset === 0" class="btn btn-secondary">Previous</button>
      <button @click="nextPage" :disabled="!hasNextPage" class="btn btn-secondary">Next</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

definePageMeta({ layout: 'app' })

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

<style scoped>
.prompts-page {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-md) var(--space-sm);
}
@media (min-width: 768px) {
  .prompts-page {
    padding: var(--space-lg) var(--space-margin-desktop);
  }
}

.prompts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.page-title {
  font-size: 28px;
  font-weight: 700;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 8px var(--space-sm);
  border-radius: var(--radius-lg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  text-decoration: none;
}
.btn-primary {
  background-color: var(--color-primary-container);
  color: var(--color-on-primary);
}
.btn-primary:hover {
  background-color: var(--color-primary);
}
.btn-secondary {
  background-color: var(--color-surface-lowest);
  color: var(--color-on-background);
  border: 1px solid var(--color-outline-variant);
}
.btn-secondary:hover:not(:disabled) {
  border-color: var(--color-primary-container);
}
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: default;
}

.filter-form {
  display: flex;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.filter-input {
  flex: 1;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-container-low);
}
.filter-input:focus {
  outline: none;
  border-color: var(--color-primary-container);
  background-color: var(--color-surface-lowest);
}

.error-text {
  color: var(--color-error);
  margin-bottom: var(--space-sm);
}

.table-card {
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-lowest);
  overflow: hidden;
}

.prompts-table {
  width: 100%;
  border-collapse: collapse;
}
.prompts-table th {
  text-align: left;
  padding: var(--space-sm);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-on-surface-variant);
  border-bottom: 1px solid var(--color-outline-variant);
}
.prompts-table td {
  padding: var(--space-sm);
  border-bottom: 1px solid var(--color-outline-variant);
}
.prompts-table tbody tr:hover {
  background-color: var(--color-surface-container-low);
}
.prompts-table tbody tr:last-child td {
  border-bottom: none;
}

.tag-chip {
  display: inline-block;
  padding: 2px var(--space-xs);
  margin: 2px;
  border-radius: var(--radius-full);
  background-color: var(--color-secondary-fixed);
  color: var(--color-on-secondary-fixed);
  font-size: 12px;
  font-weight: 600;
}

.actions-cell {
  display: flex;
  gap: var(--space-sm);
}

.link-edit {
  color: var(--color-primary-container);
  font-weight: 600;
  text-decoration: none;
}
.link-edit:hover {
  text-decoration: underline;
}

.link-delete {
  color: var(--color-error);
  font-weight: 600;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.link-delete:hover {
  text-decoration: underline;
}

.empty-cell {
  text-align: center;
  padding: var(--space-lg);
  color: var(--color-on-surface-variant);
}

.pagination {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-md);
}
</style>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p /mnt/data/sources/simple-ai-os/.nuxt/tsconfig.app.json`
Expected: no errors referencing `app/pages/prompts/index.vue`

- [ ] **Step 3: Commit**

```bash
git add app/pages/prompts/index.vue
git commit -m "$(cat <<'EOF'
feat: restyle prompts library table with shared design tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Redesign `prompts/new.vue`

**Files:**
- Modify: `app/pages/prompts/new.vue`

- [ ] **Step 1: Replace the full file contents**

```vue
<template>
  <div class="form-page">
    <h1 class="page-title">New Prompt</h1>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <form @submit.prevent="submit" class="form-card">
      <label class="field-label">
        <span>Name</span>
        <input v-model="name" type="text" required class="field-input" />
      </label>

      <label class="field-label">
        <span>Content</span>
        <textarea v-model="content" required rows="6" class="field-input field-textarea"></textarea>
      </label>

      <label class="field-label">
        <span>Description</span>
        <input v-model="description" type="text" class="field-input" />
      </label>

      <label class="field-label">
        <span>Tags (comma-separated)</span>
        <input v-model="tags" type="text" class="field-input" />
      </label>

      <label class="field-label">
        <span>Variables (comma-separated)</span>
        <input v-model="variables" type="text" class="field-input" />
      </label>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Create</button>
        <NuxtLink to="/prompts" class="btn btn-secondary">Cancel</NuxtLink>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'

definePageMeta({ layout: 'app' })

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

<style scoped>
.form-page {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-md) var(--space-sm);
}
@media (min-width: 768px) {
  .form-page {
    padding: var(--space-lg) var(--space-margin-desktop);
  }
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: var(--space-md);
}

.error-text {
  color: var(--color-error);
  margin-bottom: var(--space-sm);
}

.form-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-lowest);
}

.field-label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-on-background);
}

.field-input {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-container-low);
  font-family: var(--font-body);
  font-weight: 400;
}
.field-input:focus {
  outline: none;
  border-color: var(--color-primary-container);
  background-color: var(--color-surface-lowest);
}

.field-textarea {
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: var(--space-sm);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 8px var(--space-md);
  border-radius: var(--radius-lg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  text-decoration: none;
}
.btn-primary {
  background-color: var(--color-primary-container);
  color: var(--color-on-primary);
}
.btn-primary:hover {
  background-color: var(--color-primary);
}
.btn-secondary {
  background-color: var(--color-surface-lowest);
  color: var(--color-on-background);
  border: 1px solid var(--color-outline-variant);
}
.btn-secondary:hover {
  border-color: var(--color-primary-container);
}
</style>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p /mnt/data/sources/simple-ai-os/.nuxt/tsconfig.app.json`
Expected: no errors referencing `app/pages/prompts/new.vue`

- [ ] **Step 3: Commit**

```bash
git add app/pages/prompts/new.vue
git commit -m "$(cat <<'EOF'
feat: restyle new-prompt form with shared design tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Redesign `prompts/[id].vue`

**Files:**
- Modify: `app/pages/prompts/[id].vue`

- [ ] **Step 1: Replace the full file contents**

```vue
<template>
  <div class="form-page">
    <h1 class="page-title">Edit Prompt</h1>

    <p v-if="notFound" class="error-text">
      Prompt not found. <NuxtLink to="/prompts" class="link-inline">Back to prompts</NuxtLink>
    </p>

    <template v-else>
      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
      <p class="version-text">Version {{ version }}</p>

      <form @submit.prevent="submit" class="form-card">
        <label class="field-label">
          <span>Name</span>
          <input v-model="name" type="text" required class="field-input" />
        </label>

        <label class="field-label">
          <span>Content</span>
          <textarea v-model="content" required rows="6" class="field-input field-textarea"></textarea>
        </label>

        <label class="field-label">
          <span>Description</span>
          <input v-model="description" type="text" class="field-input" />
        </label>

        <label class="field-label">
          <span>Tags (comma-separated)</span>
          <input v-model="tags" type="text" class="field-input" />
        </label>

        <label class="field-label">
          <span>Variables (comma-separated)</span>
          <input v-model="variables" type="text" class="field-input" />
        </label>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Save</button>
          <button type="button" @click="remove" class="btn btn-danger">Delete</button>
          <NuxtLink to="/prompts" class="btn btn-secondary">Cancel</NuxtLink>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'

definePageMeta({ layout: 'app' })

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

<style scoped>
.form-page {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-md) var(--space-sm);
}
@media (min-width: 768px) {
  .form-page {
    padding: var(--space-lg) var(--space-margin-desktop);
  }
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: var(--space-sm);
}

.version-text {
  color: var(--color-on-surface-variant);
  margin-bottom: var(--space-sm);
}

.error-text {
  color: var(--color-error);
  margin-bottom: var(--space-sm);
}

.link-inline {
  color: var(--color-primary-container);
  text-decoration: underline;
}

.form-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-lowest);
}

.field-label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-on-background);
}

.field-input {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-container-low);
  font-family: var(--font-body);
  font-weight: 400;
}
.field-input:focus {
  outline: none;
  border-color: var(--color-primary-container);
  background-color: var(--color-surface-lowest);
}

.field-textarea {
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: var(--space-sm);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 8px var(--space-md);
  border-radius: var(--radius-lg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  text-decoration: none;
}
.btn-primary {
  background-color: var(--color-primary-container);
  color: var(--color-on-primary);
}
.btn-primary:hover {
  background-color: var(--color-primary);
}
.btn-secondary {
  background-color: var(--color-surface-lowest);
  color: var(--color-on-background);
  border: 1px solid var(--color-outline-variant);
}
.btn-secondary:hover {
  border-color: var(--color-primary-container);
}
.btn-danger {
  background-color: var(--color-error);
  color: #ffffff;
}
.btn-danger:hover {
  opacity: 0.9;
}
</style>
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p /mnt/data/sources/simple-ai-os/.nuxt/tsconfig.app.json`
Expected: no errors referencing `app/pages/prompts/[id].vue`

- [ ] **Step 3: Commit**

```bash
git add "app/pages/prompts/[id].vue"
git commit -m "$(cat <<'EOF'
feat: restyle edit-prompt form with shared design tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Playwright spec for the chat-streaming flow

**Files:**
- Create: `tests/e2e/chat-streaming.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test'

test.describe('chat-streaming page', () => {
  test('sends a free-text message and receives a streamed reply', async ({ page }) => {
    await page.goto('/chat-streaming')

    const textarea = page.getByPlaceholder('Type your message...')
    await textarea.fill('What is 2 + 2?')
    await page.getByRole('button', { name: 'Send message' }).click()

    await expect(page.locator('.bubble-user').last()).toHaveText('What is 2 + 2?')
    await expect(page.locator('.bubble-assistant').last()).not.toHaveText('', { timeout: 15000 })
  })
})
```

- [ ] **Step 2: Start the stack**

Run: `docker compose up -d --build -V postgres dev`

- [ ] **Step 3: Confirm the app is up**

Run: `sleep 5 && curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000`
Expected: `200`

- [ ] **Step 4: Run the Playwright spec**

Run: `npx playwright test tests/e2e/chat-streaming.spec.ts`
Expected: 1 passed. If it fails because the assistant bubble never fills in, check that
`ANTHROPIC_API_KEY` is set in `.env` (required by `server/lib/agent-streaming.ts`) before re-running.

- [ ] **Step 5: Tear down**

Run: `docker compose down`

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/chat-streaming.spec.ts
git commit -m "$(cat <<'EOF'
config: add Playwright spec for the chat-streaming flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Playwright spec for the prompts CRUD flow

**Files:**
- Create: `tests/e2e/prompts.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test'

test.describe('prompts pages', () => {
  test('creates, edits, and deletes a prompt', async ({ page }) => {
    const promptName = `e2e-test-prompt-${Date.now()}`

    await page.goto('/prompts')
    await page.getByRole('link', { name: 'New Prompt' }).click()
    await expect(page).toHaveURL(/\/prompts\/new$/)

    await page.getByLabel('Name').fill(promptName)
    await page.getByLabel('Content').fill('Say hello to {{name}}.')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page).toHaveURL(/\/prompts$/)

    const row = page.locator('tr', { hasText: promptName })
    await expect(row).toBeVisible()

    await row.getByRole('link', { name: 'Edit' }).click()
    await expect(page).toHaveURL(/\/prompts\/.+/)
    await page.getByLabel('Description').fill('Updated description')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/prompts$/)

    const updatedRow = page.locator('tr', { hasText: promptName })
    await expect(updatedRow).toContainText('Updated description')

    page.once('dialog', (dialog) => dialog.accept())
    await updatedRow.getByRole('button', { name: 'Delete' }).click()
    await expect(page.locator('tr', { hasText: promptName })).toHaveCount(0)
  })
})
```

- [ ] **Step 2: Start the stack**

Run: `docker compose up -d --build -V postgres dev`

- [ ] **Step 3: Confirm the app is up**

Run: `sleep 5 && curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000`
Expected: `200`

- [ ] **Step 4: Run the Playwright spec**

Run: `npx playwright test tests/e2e/prompts.spec.ts`
Expected: 1 passed

- [ ] **Step 5: Tear down**

Run: `docker compose down`

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/prompts.spec.ts
git commit -m "$(cat <<'EOF'
config: add Playwright spec for the prompts CRUD flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Manual visual verification in a browser

**Files:** none (verification only)

- [ ] **Step 1: Start the stack**

Run: `docker compose up -d --build -V postgres dev`

- [ ] **Step 2: Confirm the app is up**

Run: `sleep 5 && curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000`
Expected: `200`

- [ ] **Step 3: Open each redesigned page in a browser**

Visit `http://localhost:3000/chat-streaming`, `http://localhost:3000/prompts`,
`http://localhost:3000/prompts/new`, and `http://localhost:3000/prompts/<id>` for any existing prompt id.

- [ ] **Step 4: Compare against the Stitch reference screens**

Fetch the reference screenshots via `get_screen` for
`projects/16018729180732929566/screens/3f4a6b3ae9854399bd16ce9aa6e5fc3f` (chat-streaming) and
`projects/16018729180732929566/screens/c6e064c9627846ed8e741c89f0679ea0` (prompts library), and confirm
the running pages carry the same nav, indigo/Inter styling, chat bubbles, segmented mode control, and
table/chip treatment (exact pixel match is not required — this is a hand-translated approximation, not a
1:1 port).

- [ ] **Step 5: Confirm the nav's active-route indicator works**

Click between "Chat Streaming" and "Prompts" in the nav and confirm the active link's underline/color
follows the current route on all four pages, and that clicking the logo returns to `/`.

- [ ] **Step 6: Confirm index.vue is unaffected**

Visit `http://localhost:3000/` and confirm it renders identically to before this plan (same nav, hero,
CTA cards, feature grid — no shared-token bleed-through).

- [ ] **Step 7: Tear down**

Run: `docker compose down`
