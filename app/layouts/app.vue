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
