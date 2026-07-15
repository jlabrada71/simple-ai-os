# Chat Prompt Picker UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a prompt picker to `app/pages/chat-streaming.vue` so the user can invoke a saved prompt
(with parameters) instead of only sending free text, using the existing `ChatRequest` plumbing and the
browser MCP client.

**Architecture:** A `mode` ref (`'text'` or a prompt name) toggles between the existing textarea and a
generated parameter form. `listMcpPrompts()` (from `app/lib/mcp-client.ts`) populates the picker on
mount. `sendMessage` branches on `mode` to build either a `text` or `prompt` `ChatRequest`.

**Tech Stack:** Vue 3 Composition API, existing `streamingFetch`/`listMcpPrompts` modules.

**Spec:** `docs/superpowers/specs/2026-07-15-chat-prompt-picker-design.md`

---

### Task 1: Add prompt-picker state and data fetching

**Files:**
- Modify: `app/pages/chat-streaming.vue`

- [ ] **Step 1: Import `listMcpPrompts` and `onMounted`, add picker state**

In `app/pages/chat-streaming.vue`, replace:

```js
<script setup language="ts">
import { ref } from 'vue'
import { streamingFetch } from '../lib/streaming';

const userInput = ref('');
const messages = ref([]);
const chatAreaElement = useTemplateRef('chat-area');

const currentAssistantMessage = ref({ role: 'assistant', content: '' });
```

with:

```js
<script setup language="ts">
import { ref, computed, onMounted } from 'vue'
import { streamingFetch } from '../lib/streaming';
import { listMcpPrompts } from '../lib/mcp-client';

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
```

- [ ] **Step 2: Commit**

```bash
git add app/pages/chat-streaming.vue
git commit -m "feat: fetch prompts and add picker state to chat-streaming"
```

---

### Task 2: Add the picker and parameter-form markup

**Files:**
- Modify: `app/pages/chat-streaming.vue`

- [ ] **Step 1: Replace the form template**

Replace:

```html
      <form @submit.prevent="sendMessage" class="flex gap-2">
        <textarea v-model="userInput" 
          placeholder="Type your message..." 
          rows="3"
          class="bg-white w-full border rounded-lg resize-none p-2"
        ></textarea>
        <button 
          type="submit" 
          class="bg-blue-300 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded">
          Send
        </button>
      </form>
```

with:

```html
      <form @submit.prevent="sendMessage" class="flex flex-col gap-2">
        <select v-model="mode" @change="onModeChange" class="bg-white border rounded-lg p-2">
          <option value="text">Free text</option>
          <option v-for="prompt in availablePrompts" :key="prompt.name" :value="prompt.name">
            {{ prompt.name }}
          </option>
        </select>
        <div class="flex gap-2">
          <textarea v-if="mode === 'text'" v-model="userInput" 
            placeholder="Type your message..." 
            rows="3"
            class="bg-white w-full border rounded-lg resize-none p-2"
          ></textarea>
          <div v-else class="flex flex-col gap-2 w-full">
            <div v-for="arg in (selectedPrompt?.arguments || [])" :key="arg.name" class="flex flex-col">
              <label class="text-sm font-bold">{{ arg.name }}</label>
              <input v-model="promptParams[arg.name]" type="text"
                class="bg-white border rounded-lg p-2" />
            </div>
          </div>
          <button 
            type="submit" 
            class="bg-blue-300 hover:bg-blue-400 text-white font-bold py-2 px-4 rounded">
            Send
          </button>
        </div>
      </form>
```

- [ ] **Step 2: Commit**

```bash
git add app/pages/chat-streaming.vue
git commit -m "feat: render prompt picker and parameter form in chat-streaming"
```

---

### Task 3: Send `prompt` requests from `sendMessage`

**Files:**
- Modify: `app/pages/chat-streaming.vue`

- [ ] **Step 1: Branch `sendMessage` on `mode`**

Replace:

```js
const sendMessage = async () => {
  if (!userInput.value.trim()) return

  addMessage({ role: 'user', content: userInput.value });    
  messages.value.push(currentAssistantMessage.value);

  const url = '/api/agent-stream';
  // const url = '/api/stream-test'; // Use the test endpoint for streaming

  for await (const chunk of streamingFetch(url, { type: 'text', text: userInput.value })) {
    currentAssistantMessage.value.content += chunk;    
  };
  currentAssistantMessage.value = { role: 'assistant', content: '' };  
  
  userInput.value = '';
}
```

with:

```js
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
  // const url = '/api/stream-test'; // Use the test endpoint for streaming

  for await (const chunk of streamingFetch(url, request)) {
    currentAssistantMessage.value.content += chunk;    
  };
  currentAssistantMessage.value = { role: 'assistant', content: '' };  
  
  userInput.value = '';
  mode.value = 'text';
  promptParams.value = {};
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `app/pages/chat-streaming.vue`.

- [ ] **Step 3: Commit**

```bash
git add app/pages/chat-streaming.vue
git commit -m "feat: send prompt ChatRequests from chat-streaming's sendMessage"
```

---

### Task 4: End-to-end manual verification in a browser

Per this project's guidance for UI changes, verify by actually driving the feature in a browser rather
than relying on type-checking alone.

**Files:** none (verification only)

- [ ] **Step 1: Start the stack**

Run: `docker compose up -d --build -V postgres dev`

- [ ] **Step 2: Confirm the app is up**

Run: `sleep 5 && curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000`
Expected: `200`

- [ ] **Step 3: Seed a prompt with a variable (skip if `picker-check` already exists from a prior run)**

Run:
```bash
curl -s -X POST http://localhost:3000/api/prompts \
  -H 'content-type: application/json' \
  -d '{"name":"picker-check","content":"Say hello to {{name}} and nothing else.","variables":["name"]}'
```
Expected: `201` with the created row (or `409` if it already exists — either is fine, proceed).

- [ ] **Step 4: Open the chat-streaming page in a browser**

Navigate to `http://localhost:3000/chat-streaming` using a browser automation tool (e.g. the
chrome-devtools MCP tools, if available) or manually.

- [ ] **Step 5: Verify the picker lists the seeded prompt**

Confirm the `<select>` above the message form shows a "Free text" option and a `picker-check` option.

- [ ] **Step 6: Verify selecting a prompt swaps in a parameter field**

Select `picker-check` from the dropdown. Confirm the textarea is replaced by a single labeled input for
`name`, and the "Free text" textarea is gone.

- [ ] **Step 7: Verify sending a prompt produces the interpolated reply**

Type `Ada` into the `name` field and click Send. Confirm:
- A user bubble appears reading `Prompt: picker-check (name: Ada)`.
- The assistant's streamed reply greets "Ada" (proving `parameters` reached
  `resolvePromptText` on the server and were correctly interpolated).
- After sending, the dropdown resets to "Free text" and the textarea reappears empty.

- [ ] **Step 8: Verify free text still works after using the picker**

Type a plain message (e.g. "Reply with exactly the word OK and nothing else.") into the textarea and
send it. Confirm a normal user bubble with the typed text appears and the assistant streams a reply —
proving the `text` path still works unchanged after having exercised prompt mode.

- [ ] **Step 9: Tear down**

Run: `docker compose down`

---

## Self-Review Notes

- **Spec coverage:** state/data-fetching (Task 1), picker + parameter-form markup (Task 2),
  `sendMessage` branching and bubble text (Task 3), manual verification of listing, parameter-swap,
  prompt-send, mode-reset, and free-text-still-works (Task 4). Out-of-scope items (no server/lib changes,
  no new component extraction, no client-side interpolation) correctly excluded.
- **Type consistency:** `mode`, `availablePrompts`, `promptParams`, `selectedPrompt` are introduced in
  Task 1 and used with the same names/shapes in Task 2's template and Task 3's `sendMessage` — no drift.
- **No placeholders:** all steps contain complete, runnable code/markup.
