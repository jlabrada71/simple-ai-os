<template>
  <div>
    <h1>Welcome to My App</h1>
    <p>This is a simple Vue.js app.</p>
    <div class="flex gap-4">    
        <NuxtLink to="/chat-streaming" class="p-2 rounded bg-blue-300">Chat Streaming</NuxtLink>
        <NuxtLink to="/stream-test" class="p-2 rounded bg-green-300">Stream Test</NuxtLink>
        <NuxtLink to="/chat" class="p-2 rounded bg-purple-300">Chat</NuxtLink>
    </div>
  </div>

</template>
