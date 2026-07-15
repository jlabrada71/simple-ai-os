<template>  
  <!-- chat area  -->
  <div class="bg-blue-50 w-full w-full">    
    <div class="bg-blue-100max-w-4xl mx-auto p-4">
      <h1 class="text-2xl font-bold text-center py-4">Claude Chat</h1>
      <div class="bg-white rounded-lg shadow-md p-4 mb-4 h-96 overflow-y-auto"  @scroll="handleScroll" ref="chat-area">
        <div v-for="(message, index) in messages" :key="index" class="chat-message">
          <strong class="message.role=='user'? 'text-right' : 'text-left'">{{ message.role }}:</strong> 
          <div v-if="message.role=='user'" >{{ message.content }}</div>        
          <div v-else >
            <MDC :value="message.content" :cache-key="`chat-streaming-message-${index}`" />
            
          </div>
        </div>
        <div class="h-16"></div>
      </div>
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
      <button @click="newThread" class="bg-green-300 hover:bg-green-400 text-white font-bold py-2 px-4 rounded mt-4">
        New Thread
      </button>
    </div> 
    
  </div>
</template>

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

const addMessage = (message) => {
  messages.value.push(message);
  scrollToBottom();
};

const scrollToBottom = () => {
  // Wait until Vue updates the DOM with the new text
  nextTick(() => {
    if (chatAreaElement.value) {
      
      chatAreaElement.value.scrollTop = chatAreaElement.value.scrollHeight - chatAreaElement.value.clientHeight;  
    }
  })
}

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

const newThread = async() => {
  const response = await $fetch('/api/new-thread', {
    method: 'GET',    
  })
  userInput.value = ''
  messages.value = [];
}

</script>

