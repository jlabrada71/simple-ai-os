# Learnings

## `<MDC>` cache-key collisions on streamed content (2026-07-11)

**Symptom:** In `chat-streaming.vue`, only the first assistant message ever rendered
correctly through `<MDC :value="message.content" />`. Later assistant messages either
showed stale content or never updated, even though `messages.value` itself contained
the right data (confirmed via debugging).

**Root cause:** `@nuxtjs/mdc`'s `<MDC>` component keys its internal `useAsyncData` call
by `props.cacheKey ?? hashString(props.value)`
(`node_modules/@nuxtjs/mdc/dist/runtime/components/MDC.vue`). Nuxt's `useAsyncData`
cache is **global across the app**, not scoped per component instance — two calls with
the same key share the same reactive data entry.

Every new assistant message starts as `{ role: 'assistant', content: '' }` before
streaming fills it in. `hashString('')` always produces the same key
(`"mdc-0000-key"`), so every assistant message's `<MDC>` instance initially registers
under the *same* cache key as the previous one. The new instance reuses/entangles with
the old cache entry instead of parsing its own content, so only the first message ever
renders as expected.

**Fix:** give each `<MDC>` instance an explicit, unique `cache-key` so instances can't
collide on identical initial content:

```vue
<MDC :value="message.content" :cache-key="`chat-streaming-message-${index}`" />
```

**Takeaway:** Any list of `<MDC>` components rendering dynamic/streamed content needs an
explicit `cache-key` per item — don't rely on the default content-hash key when items
can share identical values (especially common initial/empty states).
