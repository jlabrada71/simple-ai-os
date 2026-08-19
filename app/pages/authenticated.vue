<script setup lang="ts">
definePageMeta({ layout: false })

const { refresh, isAuthenticated } = useAuth()
await refresh()

if (isAuthenticated.value) {
  await navigateTo('/chat')
} else {
  await navigateTo('/not-authenticated')
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <p>Signing in…</p>
  </div>
</template>
