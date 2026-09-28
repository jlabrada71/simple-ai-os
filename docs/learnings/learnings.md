# Learnings

## `drizzle-kit generate` hardcodes `"public".` on cross-table foreign keys in tenant-schema migrations (2026-08-20)

**Symptom:** Provisioning a new tenant (`provisionTenant()` / `db:provision-tenant`) failed with
`relation "public.users" does not exist` while applying the `0001_*.sql` migration that added
`threads`/`messages`/`api_keys` — even though `CREATE TABLE "users" (...)` in an earlier migration
had already applied cleanly against that same tenant's schema.

**Root cause:** `server/db/schema/tenant.ts`'s tables use `pgTable()` with no explicit
`pgSchema()` — schema-per-tenant isolation here works entirely by fixing each connection pool's
`search_path` to `tenant_<slug>,public` (see `server/db/client.ts`), not by declaring real
multi-schema Drizzle objects. `drizzle-kit generate` doesn't know about that convention: for any
`CREATE TABLE`, it emits an unqualified table name (which happens to resolve correctly via
`search_path` at apply time), but for a `FOREIGN KEY ... REFERENCES` clause it defaults to
qualifying the referenced table as `"public"."<table>"` — explicitly, not via `search_path`. This
had never surfaced before `threads`/`messages`/`api_keys` because no earlier tenant table had a
foreign key to another tenant table (`prompt_history.prompt_id` is deliberately unconstrained; see
its own comment in `server/db/schema/tenant.ts`).

**Fix:** manually stripped the `"public".` qualifier from each `REFERENCES` clause in the
generated `.sql` file (`server/db/migrations/tenant/0001_same_johnny_storm.sql`) before committing
it, leaving the table name unqualified so it resolves through `search_path` exactly like every
`CREATE TABLE` in the same file already does.

**Takeaway:** any future `npm run db:generate:tenant` that adds a foreign key between two
tenant-schema tables will regenerate this same `"public".`-qualified `REFERENCES` clause — check
the generated `.sql` for `REFERENCES "public".` and strip the schema qualifier before committing
it, the same way this fix did. This is specific to the search_path-based schema-per-tenant
pattern; it would not be an issue with a project using real per-tenant Drizzle `pgSchema()`
objects instead.

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
