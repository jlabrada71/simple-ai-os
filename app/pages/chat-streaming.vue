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
