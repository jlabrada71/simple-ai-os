
<template>
  <div style="padding: 20px;">
    <button :disabled="isStreaming" @click="start">
      {{ isStreaming ? 'Streaming...' : 'Start Stream Fetch' }}
    </button>
    
    <div style="margin-top: 20px; border: 1px solid #ccc; padding: 10px;">
      <strong>Output:</strong> {{ streamOutput }}
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { streamingFetch } from '../lib/streaming';

const streamOutput = ref('')
const isStreaming = ref(false)

const start = async () => {
  streamOutput.value = ''
  isStreaming.value = true
  for await (const chunk of streamingFetch('/api/stream-test', 'Hello, stream!')) {
    streamOutput.value += chunk
  };
  isStreaming.value = false
}


</script>

