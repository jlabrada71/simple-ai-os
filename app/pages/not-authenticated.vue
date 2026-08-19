<script setup lang="ts">
definePageMeta({ layout: false })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="text-center">
      <h1 class="mb-2 text-2xl font-semibold">Not signed in</h1>
      <p class="mb-8 text-gray-500">We couldn't sign you in. Please try again.</p>
      <a href="/login" class="text-primary underline">Back to login</a>
    </div>
  </div>
</template>
