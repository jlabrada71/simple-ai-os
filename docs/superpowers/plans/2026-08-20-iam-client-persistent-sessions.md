# Postgres-Backed `nuxt-iam-client` Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `lib/nuxt-iam-client`'s `useStorage`-based (in-memory by default) session
persistence with a Drizzle-managed Postgres table it owns itself, so sessions survive restarts
and are shared across instances — with zero code changes required in `home` or `simple-ai-os`.

**Architecture:** New `iam_client_sessions` table + Drizzle schema + migrations inside the
library itself, applied via a self-registering lazy first-request Nitro plugin (mirroring the
proven pattern in every consuming app's own `server/plugins/migrate.ts`). `createIamSession`/
`getIamSession`/`setIamSessionMetadata`/`destroyIamSession` are rewritten in place to query this
table via a module-level singleton Drizzle client reading `process.env.DATABASE_URL` directly
(no module option — see the self-review note on why the spec's tentative `databaseUrl` option is
dropped as unnecessary). `instanceId` becomes a real filtered column, replacing per-mount
`useStorage` namespace isolation.

**Tech Stack:** `drizzle-orm`/`pg` (new deps for the library), Drizzle Kit, Postgres 18, `@nuxt/kit`
(`addServerPlugin`, `nitro.serverAssets`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-iam-client-persistent-sessions-design.md`

**Repo:** `web/lib/nuxt-iam-client` (all tasks). Tasks 7–8 verify against `web/home` and
`web/simple-ai-os` without modifying either.

---

## File structure

| File | Responsibility |
|---|---|
| `package.json` | add `drizzle-orm`, `pg` deps; `drizzle-kit`, `@types/pg` devDeps (modified) |
| `drizzle.config.ts` | Drizzle Kit config for the new schema (new) |
| `src/runtime/server/db/schema.ts` | `iamClientSessions` table (new) |
| `src/runtime/server/db/client.ts` | `getSessionsDb()` singleton (new) |
| `src/runtime/server/db/migrations/**` | generated migration (new) |
| `src/runtime/server/plugins/migrate.ts` | lazy first-request migration plugin (new) |
| `src/runtime/server/utils/auth.ts` | rewrite session functions, drop `sessionStorageNamespace` (modified) |
| `src/module.ts` | register the migration plugin + serverAssets, deduped across multiple mounts (modified) |
| `test/auth-utils.test.ts` | extend with the new session-function tests (modified) |
| `test/e2e/sessions.test.ts` | real-Postgres round-trip + instance isolation (new) |

---

## Task 1: Add dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the dependencies**

```json
"dependencies": {
  "@nuxt/kit": "^4.5.2",
  "defu": "^6.1.7",
  "drizzle-orm": "^0.45.2",
  "h3": "^1.15.11",
  "pg": "^8.22.0"
},
"devDependencies": {
  "@types/node": "^26.1.2",
  "@types/pg": "^8.20.0",
  "drizzle-kit": "^0.31.10",
  "nuxt": "^4.5.2",
  "typescript": "^5.9.3",
  "vitest": "^4.1.10"
}
```

(Versions match what `simple-ai-os` already uses for the same packages, for consistency.)

- [ ] **Step 2: Install**

Run: `npm install` (from `web/lib/nuxt-iam-client`)
Expected: succeeds; `node_modules/drizzle-orm`, `node_modules/pg`, `node_modules/drizzle-kit`
present.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add drizzle-orm/pg dependencies for session persistence"
```

---

## Task 2: Schema + migration

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/runtime/server/db/schema.ts`
- Create: `src/runtime/server/db/migrations/**` (generated)

- [ ] **Step 1: Create `src/runtime/server/db/schema.ts`**

```ts
import { sql } from 'drizzle-orm'
import { bigint, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const iamClientSessions = pgTable(
  'iam_client_sessions',
  {
    id: text('id').primaryKey(),
    instanceId: text('instance_id').notNull(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    // Epoch-millis number, not timestamptz - matches Session.accessTokenExpiresAt's
    // existing `number` type exactly, so the `Date.now() >= session.accessTokenExpiresAt`
    // comparison in getIamSession needs no changes.
    accessTokenExpiresAt: bigint('access_token_expires_at', { mode: 'number' }).notNull(),
    appId: text('app_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index('iam_client_sessions_instance_id_idx').on(table.instanceId)],
)

export type IamClientSessionRow = typeof iamClientSessions.$inferSelect
export type NewIamClientSessionRow = typeof iamClientSessions.$inferInsert
```

- [ ] **Step 2: Create `drizzle.config.ts`** (package root)

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/runtime/server/db/schema.ts',
  out: './src/runtime/server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres',
  },
})
```

- [ ] **Step 3: Add a `db:generate` script to `package.json`**

```json
"db:generate": "drizzle-kit generate"
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: `src/runtime/server/db/migrations/0000_*.sql` creating `iam_client_sessions` with the
`instance_id` index, plus `meta/` and `_journal.json`.

- [ ] **Step 5: Commit**

```bash
git add drizzle.config.ts src/runtime/server/db/schema.ts src/runtime/server/db/migrations package.json
git commit -m "feat: add iam_client_sessions schema and migration"
```

---

## Task 3: `db/client.ts` singleton

**Files:**
- Create: `src/runtime/server/db/client.ts`

- [ ] **Step 1: Create the file**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

let cachedDb: ReturnType<typeof drizzle> | undefined

/**
 * One connection pool per process, shared across every mount of this module
 * in the same app (e.g. home's admin + tenant instances) - reads
 * process.env.DATABASE_URL directly at call time rather than a module
 * option threaded through Nuxt runtimeConfig, matching every other
 * DB-touching file in this workspace and avoiding the build-time-baking
 * pitfall documented in module.ts's own comment about the iamClientInstances
 * runtimeConfig nesting.
 */
export function getSessionsDb() {
  if (!cachedDb) {
    const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres'
    const pool = new Pool({ connectionString })
    cachedDb = drizzle(pool)
  }
  return cachedDb
}
```

- [ ] **Step 2: Commit**

```bash
git add src/runtime/server/db/client.ts
git commit -m "feat: add shared session-store Drizzle client"
```

---

## Task 4: Rewrite session functions in `auth.ts`

**Files:**
- Modify: `src/runtime/server/utils/auth.ts`
- Modify: `test/auth-utils.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `test/auth-utils.test.ts` (read the file
  first to match its existing import/mock style exactly before appending):

```ts
// Additions to test/auth-utils.test.ts
import { createIamSession, getIamSession, setIamSessionMetadata, destroyIamSession } from '../src/runtime/server/utils/auth'

function fakeEvent(cookies: Record<string, string> = {}) {
  const store = { ...cookies }
  return {
    node: { req: { headers: { cookie: Object.entries(store).map(([k, v]) => `${k}=${v}`).join('; ') } } },
    __cookies: store,
  } as any
}

describe('session persistence', () => {
  it('round-trips a session through create -> get -> destroy', async () => {
    const event = fakeEvent()
    const created = await createIamSession(event, 'test-instance', {
      username: 'sub-1',
      email: 'a@b.com',
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: Date.now() + 60_000,
      appId: 'app-1',
    })
    expect(created.id).toBeTruthy()

    // Simulate the cookie the create call set, for the get/destroy calls below.
    const getEvent = fakeEvent({ [`iam_session_test-instance`]: created.id })
    const fetched = await getIamSession(getEvent, 'test-instance')
    expect(fetched?.email).toBe('a@b.com')

    await destroyIamSession(getEvent, 'test-instance')
    const afterDestroy = await getIamSession(getEvent, 'test-instance')
    expect(afterDestroy).toBeNull()
  })

  it('keeps sessions isolated by instanceId', async () => {
    const event = fakeEvent()
    const created = await createIamSession(event, 'instance-a', {
      username: 'sub-2',
      email: 'iso@b.com',
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: Date.now() + 60_000,
      appId: 'app-1',
    })

    // Same session id, but looked up under a different instanceId - must not resolve.
    const wrongInstanceEvent = fakeEvent({ [`iam_session_instance-b`]: created.id })
    expect(await getIamSession(wrongInstanceEvent, 'instance-b')).toBeNull()
  })

  it('merges metadata via setIamSessionMetadata', async () => {
    const event = fakeEvent()
    const created = await createIamSession(event, 'meta-instance', {
      username: 'sub-3',
      email: 'meta@b.com',
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: Date.now() + 60_000,
      appId: 'app-1',
    })

    const sessionEvent = fakeEvent({ [`iam_session_meta-instance`]: created.id })
    await setIamSessionMetadata(sessionEvent, 'meta-instance', { tenantUserId: 'u1' })
    const fetched = await getIamSession(sessionEvent, 'meta-instance')
    expect(fetched?.metadata).toEqual({ tenantUserId: 'u1' })
  })
})
```

  Note: this test hits a **real local Postgres** (set `DATABASE_URL` before running, e.g.
  `postgres://postgres:postgres@localhost:5433/simple-ai-os` against the existing
  `simple-ai-os-postgres-1` container) — there is no mock-based unit test path here, since the
  whole point is verifying real persistence. Add a note to this effect at the top of the new
  `describe` block.

- [ ] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL=postgres://simple_ai_os:simple_ai_os@localhost:5433/simple-ai-os npx vitest run test/auth-utils.test.ts`
Expected: FAIL — table doesn't exist yet (migration hasn't run outside the Nitro plugin context)
or the functions still use `useStorage` (which throws/no-ops outside a Nitro request context)

- [ ] **Step 3: Apply the migration manually against the test database** (the Nitro plugin only
  runs inside a booted Nitro server — for this standalone Vitest run, apply it directly once):

```bash
DATABASE_URL=postgres://simple_ai_os:simple_ai_os@localhost:5433/simple-ai-os npx tsx -e "
import('drizzle-orm/node-postgres/migrator').then(async ({ migrate }) => {
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  await migrate(drizzle(pool), { migrationsFolder: './src/runtime/server/db/migrations' })
  console.log('migrated')
  process.exit(0)
})
"
```

- [ ] **Step 4: Rewrite the session functions in `src/runtime/server/utils/auth.ts`** — replace
  `sessionStorageNamespace` and the four functions' bodies (keep every other export in this file
  unchanged):

```ts
// Remove this export entirely:
// export function sessionStorageNamespace(instanceId: string): string { ... }

// Add these imports at the top of the file:
import { and, eq } from 'drizzle-orm'
import { getSessionsDb } from '../db/client'
import { iamClientSessions, type IamClientSessionRow } from '../db/schema'

function rowToSession(row: IamClientSessionRow): Session {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
    appId: row.appId,
    metadata: row.metadata ?? undefined,
  }
}

export async function createIamSession(
  event: H3Event,
  instanceId: string,
  data: Omit<Session, 'id'>,
): Promise<Session> {
  const id = randomBytes(32).toString('base64url')
  await getSessionsDb().insert(iamClientSessions).values({
    id,
    instanceId,
    username: data.username,
    email: data.email,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    accessTokenExpiresAt: data.accessTokenExpiresAt,
    appId: data.appId,
    metadata: data.metadata ?? null,
  })
  setCookie(event, sessionCookieName(instanceId), id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
  const session: Session = { id, ...data }
  iamDebugLog('createIamSession', 'iam session created', { instanceId, email: data.email, appId: data.appId, expiresAt: data.accessTokenExpiresAt })
  return session
}

export async function setIamSessionMetadata(event: H3Event, instanceId: string, metadata: Record<string, unknown>): Promise<void> {
  const id = getCookie(event, sessionCookieName(instanceId))
  if (!id) return
  const db = getSessionsDb()
  const [row] = await db
    .select()
    .from(iamClientSessions)
    .where(and(eq(iamClientSessions.id, id), eq(iamClientSessions.instanceId, instanceId)))
    .limit(1)
  if (!row) return
  const merged = { ...(row.metadata ?? {}), ...metadata }
  await db.update(iamClientSessions).set({ metadata: merged }).where(eq(iamClientSessions.id, id))
}

export async function getIamSession(event: H3Event, instanceId: string): Promise<Session | null> {
  const id = getCookie(event, sessionCookieName(instanceId))
  if (!id) {
    iamDebugLog('getIamSession', 'no session cookie present', { instanceId })
    return null
  }

  const db = getSessionsDb()
  const [row] = await db
    .select()
    .from(iamClientSessions)
    .where(and(eq(iamClientSessions.id, id), eq(iamClientSessions.instanceId, instanceId)))
    .limit(1)
  if (!row) {
    iamDebugLog('getIamSession', 'session cookie present but no matching session in storage', { instanceId })
    return null
  }

  const session = rowToSession(row)

  if (Date.now() >= session.accessTokenExpiresAt) {
    iamDebugLog('getIamSession', 'access token expired, attempting refresh', { instanceId, email: session.email })
    try {
      const credentials = await resolveIamCredentials(event, instanceId)
      if (!credentials) throw new Error('no credentials resolved for refresh')
      const refreshed = await refreshAccessToken(credentials, session.refreshToken)
      session.accessToken = refreshed.token
      session.refreshToken = refreshed.refresh_token
      session.accessTokenExpiresAt = Date.now() + refreshed.expires_in * 1000
      await db
        .update(iamClientSessions)
        .set({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          accessTokenExpiresAt: session.accessTokenExpiresAt,
        })
        .where(eq(iamClientSessions.id, id))
      iamDebugLog('getIamSession', 'access token refreshed', { instanceId, email: session.email })
    } catch {
      iamDebugLog('getIamSession', 'refresh failed, destroying session', { instanceId, email: session.email })
      await destroyIamSession(event, instanceId)
      return null
    }
  }

  return session
}

export async function destroyIamSession(event: H3Event, instanceId: string) {
  const id = getCookie(event, sessionCookieName(instanceId))
  if (id) {
    await getSessionsDb().delete(iamClientSessions).where(and(eq(iamClientSessions.id, id), eq(iamClientSessions.instanceId, instanceId)))
  }
  deleteCookie(event, sessionCookieName(instanceId))
  iamDebugLog('destroyIamSession', 'session destroyed', { instanceId, hadSession: Boolean(id) })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `DATABASE_URL=postgres://simple_ai_os:simple_ai_os@localhost:5433/simple-ai-os npx vitest run test/auth-utils.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full library test suite**

Run: `DATABASE_URL=postgres://simple_ai_os:simple_ai_os@localhost:5433/simple-ai-os npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/runtime/server/utils/auth.ts test/auth-utils.test.ts
git commit -m "feat: persist iam sessions to Postgres instead of useStorage"
```

---

## Task 5: Migration plugin

**Files:**
- Create: `src/runtime/server/plugins/migrate.ts`

- [ ] **Step 1: Create the plugin**, mirroring the exact pattern from every consuming app's own
  `server/plugins/migrate.ts` (deferred to first real request, `x-nitro-prerender`-guarded, `503`
  + promise-reset on failure, never `process.exit()`):

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { defineNitroPlugin } from 'nitropack/runtime/plugin'
import { getHeader, createError } from 'h3'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { getSessionsDb } from '../db/client'

interface MigrationStorage {
  getKeys(): Promise<string[]> | string[]
  getItem(key: string): Promise<unknown> | unknown
}

async function materializeMigrationAssets(storage: MigrationStorage): Promise<string> {
  const keys = await storage.getKeys()
  const dir = mkdtempSync(join(tmpdir(), 'nuxt-iam-client-migrations-'))

  for (const key of keys) {
    const relativePath = key.replace(/:/g, '/')
    const content = await storage.getItem(key)
    const filePath = join(dir, relativePath)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content))
  }

  return dir
}

export default defineNitroPlugin((nitroApp) => {
  let migrationPromise: Promise<void> | null = null

  nitroApp.hooks.hook('request', async (event) => {
    if (getHeader(event, 'x-nitro-prerender')) return

    if (!migrationPromise) {
      migrationPromise = (async () => {
        const dir = await materializeMigrationAssets(useStorage('assets:nuxtIamClientMigrations'))
        await migrate(getSessionsDb(), { migrationsFolder: dir })
      })()
        .then(() => console.log('nuxt-iam-client: session store migrations applied'))
        .catch((error) => {
          console.error('nuxt-iam-client: session store migration failed:', error)
          migrationPromise = null
          throw error
        })
    }

    try {
      await migrationPromise
    } catch {
      throw createError({
        statusCode: 503,
        statusMessage: 'Service temporarily unavailable: iam session store migration failed',
      })
    }
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add src/runtime/server/plugins/migrate.ts
git commit -m "feat: add lazy first-request migration plugin for the session store"
```

---

## Task 6: Wire the plugin into `module.ts`

**Files:**
- Modify: `src/module.ts`

- [ ] **Step 1: Add `addServerPlugin` to the `@nuxt/kit` import**

```ts
import { addImports, addServerHandler, addServerImportsDir, addServerPlugin, addTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
```

- [ ] **Step 2: Register the migrations asset + plugin, deduped across multiple mounts** — add
  this inside `setup()`, after the existing `addServerImportsDir` call and before the
  `wrapperFor` block:

```ts
    // Session-store migrations + boot plugin: registered once per app even
    // if this module is mounted more than once (e.g. home's admin + tenant
    // instances share one physical iam_client_sessions table) - a second
    // setup() call for a second mount must not re-push the same serverAsset
    // or re-register the same Nitro plugin.
    nuxt.options.nitro = nuxt.options.nitro || {}
    nuxt.options.nitro.serverAssets = nuxt.options.nitro.serverAssets || []
    const alreadyRegistered = nuxt.options.nitro.serverAssets.some(
      (asset) => asset.baseName === 'nuxtIamClientMigrations',
    )
    if (!alreadyRegistered) {
      nuxt.options.nitro.serverAssets.push({
        baseName: 'nuxtIamClientMigrations',
        dir: resolver.resolve('./runtime/server/db/migrations'),
      })
      addServerPlugin(resolver.resolve('./runtime/server/plugins/migrate'))
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/module.ts
git commit -m "feat: register session store migrations and boot plugin from the module"
```

---

## Task 7: e2e test — real Postgres, both dimensions of isolation

**Files:**
- Create: `test/e2e/sessions.test.ts`

- [ ] **Step 1: Write the test** — this duplicates some of Task 4's coverage deliberately, at a
  slightly different layer: it exercises the module's public API exactly as a consuming app would
  (create → cookie → get → refresh-path shape → destroy), confirming the full round trip once
  more end to end, plus the specific expiry/refresh interaction:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createIamSession, getIamSession, destroyIamSession } from '../../src/runtime/server/utils/auth'

function fakeEvent(cookies: Record<string, string> = {}) {
  return {
    node: { req: { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } } },
  } as any
}

describe('sessions e2e (real Postgres via DATABASE_URL)', () => {
  it('returns null for an already-expired session whose refresh also fails, and cleans it up', async () => {
    const createEvent = fakeEvent()
    const created = await createIamSession(createEvent, 'e2e-instance', {
      username: 'e2e-sub',
      email: 'e2e@b.com',
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: Date.now() - 1000, // already expired
      appId: 'app-1',
    })

    const getEvent = fakeEvent({ [`iam_session_e2e-instance`]: created.id })
    // resolveIamCredentials will throw inside getIamSession because no
    // runtime config / resolveIamAppCredentials exists in this standalone
    // test context - this is exactly the "refresh failed" path, which must
    // destroy the session rather than throw.
    const result = await getIamSession(getEvent, 'e2e-instance')
    expect(result).toBeNull()

    // Confirm it's actually gone, not just reported null due to a transient error.
    const secondAttempt = await getIamSession(getEvent, 'e2e-instance')
    expect(secondAttempt).toBeNull()
  })
})
```

- [ ] **Step 2: Run it against real Postgres**

Run: `DATABASE_URL=postgres://simple_ai_os:simple_ai_os@localhost:5433/simple-ai-os npx vitest run test/e2e/sessions.test.ts`
Expected: PASS

- [ ] **Step 3: Run the full library suite once more**

Run: `DATABASE_URL=postgres://simple_ai_os:simple_ai_os@localhost:5433/simple-ai-os npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add test/e2e/sessions.test.ts
git commit -m "test: add e2e coverage for the expired-session-refresh-failure cleanup path"
```

---

## Task 8: Manual verification against both consuming apps

**Files:** none (verification only)

- [ ] **Step 1: `simple-ai-os`** — `npx nuxt prepare` (from `web/simple-ai-os`) to confirm the
  updated module still resolves cleanly; then `npm run dev` with `DATABASE_URL` set, confirm the
  server boots without error and the migration plugin logs "session store migrations applied" on
  first request; confirm `\dt tenant_*.iam_client_sessions`... no — confirm
  `\dt public.iam_client_sessions` exists in the `simple-ai-os` database (this table lives in
  `public`, not any tenant schema, per the design's decision 1).

- [ ] **Step 2: `home`** — same: `npx nuxt prepare`, then `npm run dev` with `DATABASE_URL` set,
  confirm boot succeeds and `public.iam_client_sessions` appears in the `tryyourideas` database
  too (a **separate** table in a **separate** database from `simple-ai-os`'s, since each app has
  its own `DATABASE_URL` — this is expected and correct, not a bug: each app's session store is
  independent, matching how each app's own tenant data is already independent).

- [ ] **Step 3: Confirm session survival across a restart** (the actual behavior being fixed) —
  in either app: log in (or, absent a live `iam`, insert a row directly via `createIamSession`
  called from a `tsx` script, matching the pattern used for manual verification in prior rounds),
  restart the dev server, confirm `getIamSession` for that same cookie value still resolves
  (proving persistence survived the restart, which the old in-memory driver could never do).

- [ ] **Step 4: No commit** — this task is verification only, confirming Tasks 1–7's changes work
  correctly from both consuming apps' perspective with zero changes needed in either.

---

## Task 9: Documentation

**Files:**
- Modify: `README.md` (library)
- Modify: `simple-ai-os/docs/backlog.md`
- Modify: `simple-ai-os/docs/changes.md`
- Modify: `simple-ai-os/docs/architecture/07-target-architecture.md`
- Modify: `home/docs/architecture/ApplicationArchitecture.md`

- [ ] **Step 1: Update `lib/nuxt-iam-client/README.md`** — the line "Session storage (Nitro
  `useStorage`, in-memory by default) with transparent refresh-token rotation." no longer
  reflects reality; replace with something like: "Session storage in a Postgres table the module
  manages itself (`iam_client_sessions`, via `DATABASE_URL`) with transparent refresh-token
  rotation."

- [ ] **Step 2: In `simple-ai-os/docs/backlog.md`**, narrow the WP-4 item to just its two
  remaining parts (retention policy, backup/restore) — remove the persistent-session-store
  sentence from its description since part 1 is now done, and add a one-line note this part
  shipped, pointing at the spec.

- [ ] **Step 3: Append an entry to `simple-ai-os/docs/changes.md`** summarizing the change and
  linking `docs/superpowers/specs/2026-08-20-iam-client-persistent-sessions-design.md`.

- [ ] **Step 4: Update `simple-ai-os/docs/architecture/07-target-architecture.md`** — the three
  lines referencing "in-memory `iam:sessions`" / "T19 Redis (or DB)" / "Session store backend —
  Redis vs. DB" (§3.3, §5.1, §7) should note this is resolved (Postgres, via the library itself)
  rather than still describing it as an open target/decision.

- [ ] **Step 5: Update `home/docs/architecture/ApplicationArchitecture.md`** — the sentence
  "both are `iam`-backed SSO sessions held in `nuxt-iam-client`'s in-memory store" should say
  "Postgres-backed store" instead.

- [ ] **Step 6: Commit** (split across repos — two commits)

```bash
# in web/lib/nuxt-iam-client
git add README.md
git commit -m "docs: document Postgres-backed session storage"

# in web/simple-ai-os
git add docs/backlog.md docs/changes.md docs/architecture/07-target-architecture.md
git commit -m "docs: record nuxt-iam-client persistent session storage as implemented"

# in web/home
git add docs/architecture/ApplicationArchitecture.md
git commit -m "docs: update nuxt-iam-client session storage description"
```

---

## Self-review notes

- **Spec coverage**: all 5 numbered decisions map to tasks — schema (Task 2), independent
  connection/no-runtimeConfig-threading (Task 3), lazy migration plugin (Tasks 5–6), transparent
  to consuming apps / zero app-side changes (verified in Task 8), auth-attempt cookies unaffected
  (no task touches them, confirmed by inspecting the unchanged parts of `auth.ts` in Task 4).
- **Resolved tension, noted explicitly**: the spec's decision 2 mentions "a `databaseUrl` module
  option, falling back to `process.env.DATABASE_URL`" as one way to describe overridability: this
  plan implements only the `process.env.DATABASE_URL` fallback, with no module option, since
  nothing in either consuming app needs an override today and the spec's own stated reasoning
  ("safest read directly from `process.env` at call time") already argues against threading it
  through `runtimeConfig` — the simplification is consistent with the spec's own logic, not a
  deviation from its actual requirement (a working, environment-driven connection).
- **Type consistency checked**: `Session`'s `accessTokenExpiresAt: number` type, the schema's
  `bigint(..., { mode: 'number' })` column, and every read/write site in the rewritten `auth.ts`
  all agree on treating it as a plain JS number throughout — no `Date` object ever appears.
- **Dedup guards checked**: both the `serverAssets` push and `addServerPlugin` call in Task 6 are
  gated by the same `alreadyRegistered` check, so `home`'s two mounts (`admin`, `tenant`) register
  the migration exactly once, not twice.
