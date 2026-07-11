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
            <MDC :value="message.content" />
            
          </div>
        </div>
        <div class="h-16"></div>
      </div>
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
      <button @click="newThread" class="bg-green-300 hover:bg-green-400 text-white font-bold py-2 px-4 rounded mt-4">
        New Thread
      </button>
      <button @click="scrollToBottom" class="bg-green-300 hover:bg-green-400 text-white font-bold py-2 px-4 rounded mt-4">
        Scroll to Bottom
      </button>
    </div> 
    
  </div>
</template>

<script setup>
import { ref } from 'vue'

const userInput = ref('');
const messages = ref([]);
const chatAreaElement = useTemplateRef('chat-area');

const scrollToBottom = () => {
  // Wait until Vue updates the DOM with the new text
  nextTick(() => {
    if (chatAreaElement.value) {
      
      chatAreaElement.value.scrollTop = chatAreaElement.value.scrollHeight - chatAreaElement.value.clientHeight;
      console.log(`Scrolling to bottom of chat area ${chatAreaElement.value.scrollTop} = ${chatAreaElement.value.scrollHeight} - ${chatAreaElement.value.clientHeight}`);
    }
  })
}
const addMessage = (message) => {
  messages.value.push(message);
  scrollToBottom();
};

const handleScroll = (event) => {
  const { scrollTop, clientHeight, scrollHeight } = event.target;
  
  console.log(`Scrolled to: ${scrollTop} / ${scrollHeight}  | Client Height: ${clientHeight}`);

  if (scrollTop + clientHeight >= scrollHeight) {
    console.log('Reached the bottom of the textarea');
  }
};

const sendMessage = async () => {
  if (!userInput.value.trim()) return

  addMessage({ role: 'user', content: userInput.value });

  const response = await $fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: userInput.value })
  })
  userInput.value = '';  

  addMessage({ role: 'assistant', content: response });
}

const newThread = async() => {
  const response = await $fetch('/api/new-thread', {
    method: 'GET',    
  })
  userInput.value = ''
  messages.value = [];
}

</script>

