<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'simple-ai-os - Log In' })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="w-full max-w-md rounded-xl p-8 text-center">
      <h1 class="mb-2 text-2xl font-semibold">Log In</h1>
      <p class="mb-8 text-gray-500">Sign in with your tryyourideas ID to continue.</p>
      <a href="/api/auth/iam/login" class="inline-block w-full rounded-lg bg-primary px-6 py-3 text-white hover:opacity-90">
        Log in with tryyourideas ID
      </a>
    </div>
  </div>
</template>
