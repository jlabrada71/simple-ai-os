# Surface simple-ai-os Provisioning Status in Tenants Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin see, from `home`'s Tenants list, whether each tenant's `simple-ai-os`
space exists, and retry a failed one without CLI access.

**Architecture:** A new nullable `simpleAiOsProvisionedAt` column on `public.tenants`, set
wherever provisioning already succeeds (creation, bulk backfill script, and a new per-tenant
retry endpoint). The list endpoint returns it; the list page renders a status badge and,
when unset, a Retry button.

**Tech Stack:** Nuxt 4/Nitro, Drizzle ORM, Postgres, Vitest (`@nuxt/test-utils/e2e` real-server
pattern already established in `test/e2e-api/admin-tenants-api.test.ts`).

**Spec:** `docs/superpowers/specs/2026-08-20-simple-ai-os-provisioning-status-ui-design.md`

**Repo:** `web/home` (all tasks).

---

## File structure

| File | Responsibility |
|---|---|
| `server/db/schema/public.ts` | add `simpleAiOsProvisionedAt` column (modified) |
| `server/db/migrations/public/**` | generated migration (new) |
| `server/api/admin/tenants/index.get.ts` | return the new column (modified) |
| `server/api/admin/tenants/index.post.ts` | set the column on successful creation (modified) |
| `server/api/admin/tenants/retry-simple-ai-os.post.ts` | per-tenant retry endpoint (new) |
| `server/db/scripts/backfill-simple-ai-os-tenant.ts` | set the column on successful backfill (modified) |
| `app/pages/admin/tenants/index.vue` | status badge + Retry button (modified) |
| `test/e2e-api/admin-tenants-api.test.ts` | extend with status-column and retry-endpoint coverage (modified) |

---

## Task 1: Schema + migration

**Files:**
- Modify: `server/db/schema/public.ts`

- [ ] **Step 1: Add the column**

```ts
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  schemaName: text('schema_name').notNull().unique(),
  companyName: text('company_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  simpleAiOsProvisionedAt: timestamp('simple_ai_os_provisioned_at', { withTimezone: true }),
})
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate:public`
Expected: a new `server/db/migrations/public/00xx_*.sql` adding the nullable column.

- [ ] **Step 3: Run the full unit suite** (schema-only change so far)

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/db/schema/public.ts server/db/migrations/public
git commit -m "feat: add simpleAiOsProvisionedAt column to tenants"
```

---

## Task 2: Persist the column wherever provisioning succeeds

**Files:**
- Modify: `server/api/admin/tenants/index.post.ts`
- Modify: `server/db/scripts/backfill-simple-ai-os-tenant.ts`

- [ ] **Step 1: Update `server/api/admin/tenants/index.post.ts`** — after the existing
  `simpleAiOsProvisioned` block, persist the timestamp on success:

```ts
  let simpleAiOsProvisioned = false
  try {
    const result = await provisionSimpleAiOsTenant({ slug, name })
    simpleAiOsProvisioned = result.ok
    if (result.ok) {
      await publicDb.update(tenants).set({ simpleAiOsProvisionedAt: new Date() }).where(eq(tenants.slug, slug))
    }
  } catch (error) {
    console.error('Error provisioning simple-ai-os tenant:', error)
  }

  return { success: true, slug, schemaName, simpleAiOsProvisioned }
```

  Add `eq` to the existing `drizzle-orm` import at the top of the file (it currently only
  imports `sql`):

```ts
import { eq, sql } from 'drizzle-orm'
```

- [ ] **Step 2: Update `server/db/scripts/backfill-simple-ai-os-tenant.ts`**

```ts
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { tenants } from '../schema/public'
import { provisionSimpleAiOsTenant } from '../../utils/simpleAiOsProvisioning'

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tryyourideas'

async function main() {
  const sql = postgres(connectionString, { max: 1 })
  const db = drizzle(sql)
  const allTenants = await db.select().from(tenants)

  for (const tenant of allTenants) {
    const result = await provisionSimpleAiOsTenant({ slug: tenant.slug, name: tenant.companyName })
    if (result.ok) {
      await db.update(tenants).set({ simpleAiOsProvisionedAt: new Date() }).where(eq(tenants.slug, tenant.slug))
      console.log(`simple-ai-os: tenant "${tenant.slug}" ${result.alreadyExisted ? 'already provisioned' : 'provisioned'}`)
    } else {
      console.error(`simple-ai-os: failed to provision tenant "${tenant.slug}" — will need another retry`)
    }
  }

  await sql.end()
}

main().catch((error) => {
  console.error('Backfill failed:', error)
  process.exit(1)
})
```

  (Moved `await sql.end()` to after the loop instead of right after the initial `select`, since
  the loop now needs the connection for the `update` calls too — the original script closed the
  connection immediately after listing tenants, before the loop, which only worked because
  `provisionSimpleAiOsTenant` doesn't touch `db` at all; now that the loop does, it must stay
  open.)

- [ ] **Step 3: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/api/admin/tenants/index.post.ts server/db/scripts/backfill-simple-ai-os-tenant.ts
git commit -m "feat: persist simple-ai-os provisioning status on success"
```

---

## Task 3: List endpoint returns the column; new retry endpoint

**Files:**
- Modify: `server/api/admin/tenants/index.get.ts`
- Create: `server/api/admin/tenants/retry-simple-ai-os.post.ts`

- [ ] **Step 1: Update `server/api/admin/tenants/index.get.ts`**

```ts
import { desc } from 'drizzle-orm'
import { requireAdminSession } from '../../../utils/adminAuth'
import { publicDb } from '../../../db/client'
import { tenants } from '../../../db/schema/public'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)

  const rows = await publicDb
    .select({
      id: tenants.id,
      slug: tenants.slug,
      companyName: tenants.companyName,
      createdAt: tenants.createdAt,
      simpleAiOsProvisionedAt: tenants.simpleAiOsProvisionedAt,
    })
    .from(tenants)
    .orderBy(desc(tenants.createdAt))

  return { tenants: rows }
})
```

- [ ] **Step 2: Create `server/api/admin/tenants/retry-simple-ai-os.post.ts`** — flat route
  taking `{ slug }` in the body, matching `migrate.post.ts`'s existing convention (not a
  `[slug]`-dynamic route):

```ts
import { eq } from 'drizzle-orm'
import { requireAdminSession } from '../../../utils/adminAuth'
import { publicDb } from '../../../db/client'
import { tenants } from '../../../db/schema/public'
import { provisionSimpleAiOsTenant } from '../../../utils/simpleAiOsProvisioning'

interface RetryBody {
  slug?: string
}

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)

  const body = await readBody<RetryBody>(event)
  const slug = body?.slug
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'slug is required' })
  }

  const [tenant] = await publicDb.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown tenant' })
  }

  const result = await provisionSimpleAiOsTenant({ slug: tenant.slug, name: tenant.companyName })
  if (!result.ok) {
    throw createError({ statusCode: 502, statusMessage: 'simple-ai-os provisioning failed — retry is safe' })
  }

  await publicDb.update(tenants).set({ simpleAiOsProvisionedAt: new Date() }).where(eq(tenants.slug, slug))

  return { success: true, slug, simpleAiOsProvisionedAt: new Date().toISOString() }
})
```

- [ ] **Step 3: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/api/admin/tenants/index.get.ts server/api/admin/tenants/retry-simple-ai-os.post.ts
git commit -m "feat: return provisioning status from the list endpoint, add a per-tenant retry endpoint"
```

---

## Task 4: e2e-api coverage

**Files:**
- Modify: `test/e2e-api/admin-tenants-api.test.ts`

- [ ] **Step 1: Read the current file** to confirm the fake `simple-ai-os` server and
  `fakeSimpleAiOsShouldFail` flag (added during the cross-app-provisioning round) are still
  exactly where expected before extending.

- [ ] **Step 2: Add test cases inside the existing `describe('POST /api/admin/tenants')` block**

```ts
    it('persists simpleAiOsProvisionedAt on successful creation, and the list endpoint returns it', async () => {
      const cookie = await loginAsAdminApi()
      const slug = `e2e-status-ok-${Date.now()}`
      provisionedSchemas.push(`tenant_${slug}`)

      await $fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { cookie },
        body: { name: 'Acme Test Co', slug, ownerName: 'Jane Owner', ownerEmail: 'jane@acme.com' },
      })

      const { tenants: list } = await $fetch<{ tenants: { slug: string; simpleAiOsProvisionedAt: string | null }[] }>('/api/admin/tenants', {
        headers: { cookie },
      })
      const row = list.find((t) => t.slug === slug)
      expect(row?.simpleAiOsProvisionedAt).not.toBeNull()
    })

    it('leaves simpleAiOsProvisionedAt null on a failed creation', async () => {
      fakeSimpleAiOsShouldFail = true
      const cookie = await loginAsAdminApi()
      const slug = `e2e-status-fail-${Date.now()}`
      provisionedSchemas.push(`tenant_${slug}`)

      await $fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { cookie },
        body: { name: 'Acme Test Co', slug, ownerName: 'Jane Owner', ownerEmail: 'jane@acme.com' },
      })

      const { tenants: list } = await $fetch<{ tenants: { slug: string; simpleAiOsProvisionedAt: string | null }[] }>('/api/admin/tenants', {
        headers: { cookie },
      })
      const row = list.find((t) => t.slug === slug)
      expect(row?.simpleAiOsProvisionedAt).toBeNull()
    })
```

- [ ] **Step 3: Add a new `describe('POST /api/admin/tenants/retry-simple-ai-os')` block**

```ts
  describe('POST /api/admin/tenants/retry-simple-ai-os', () => {
    it('retries a tenant whose initial creation failed, and persists the status', async () => {
      fakeSimpleAiOsShouldFail = true
      const cookie = await loginAsAdminApi()
      const slug = `e2e-retry-${Date.now()}`
      provisionedSchemas.push(`tenant_${slug}`)

      await $fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { cookie },
        body: { name: 'Acme Test Co', slug, ownerName: 'Jane Owner', ownerEmail: 'jane@acme.com' },
      })

      fakeSimpleAiOsShouldFail = false
      const retryResult = await $fetch<{ success: boolean }>('/api/admin/tenants/retry-simple-ai-os', {
        method: 'POST',
        headers: { cookie },
        body: { slug },
      })
      expect(retryResult.success).toBe(true)

      const { tenants: list } = await $fetch<{ tenants: { slug: string; simpleAiOsProvisionedAt: string | null }[] }>('/api/admin/tenants', {
        headers: { cookie },
      })
      expect(list.find((t) => t.slug === slug)?.simpleAiOsProvisionedAt).not.toBeNull()
    })

    it('rejects an unknown slug with 404', async () => {
      const cookie = await loginAsAdminApi()
      await expect(
        $fetch('/api/admin/tenants/retry-simple-ai-os', { method: 'POST', headers: { cookie }, body: { slug: 'no-such-tenant' } })
      ).rejects.toMatchObject({ data: { statusMessage: 'Unknown tenant' } })
    })

    it('rejects without an admin session', async () => {
      await expect(
        $fetch('/api/admin/tenants/retry-simple-ai-os', { method: 'POST', body: { slug: 'whatever' } })
      ).rejects.toMatchObject({ data: { statusMessage: 'Unauthorized' } })
    })
  })
```

- [ ] **Step 4: Run the extended test file**

Run: `npm run test:e2e-api -- admin-tenants-api` (against real local Postgres, same as this
project's existing e2e-api tests)
Expected: PASS, including all new cases.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add test/e2e-api/admin-tenants-api.test.ts
git commit -m "test: cover simple-ai-os provisioning status persistence and retry endpoint"
```

---

## Task 5: UI

**Files:**
- Modify: `app/pages/admin/tenants/index.vue`

- [ ] **Step 1: Update the page** — add `simpleAiOsProvisionedAt` to the `TenantSummary`
  interface, a retry handler, and a status badge per row:

```vue
<script setup lang="ts">
definePageMeta({
  layout: false,
  middleware: 'admin-auth',
})

interface TenantSummary {
  id: string
  slug: string
  companyName: string
  createdAt: string
  simpleAiOsProvisionedAt: string | null
}

const requestFetch = useRequestFetch()
const { data, error, refresh } = await useAsyncData('admin-tenants-list', () =>
  requestFetch<{ tenants: TenantSummary[] }>('/api/admin/tenants')
)
const tenantsList = computed(() => data.value?.tenants ?? [])

const retryingSlug = ref<string | null>(null)
const retryError = ref('')

async function retrySimpleAiOs(slug: string) {
  retryingSlug.value = slug
  retryError.value = ''
  try {
    await $fetch('/api/admin/tenants/retry-simple-ai-os', { method: 'POST', body: { slug } })
    await refresh()
  } catch (err: any) {
    retryError.value = err.data?.statusMessage || err.data?.message || 'Retry failed'
  } finally {
    retryingSlug.value = null
  }
}

useHead({ title: 'Admin - Tenants' })
</script>

<template>
  <div class="mx-auto max-w-3xl px-margin-mobile py-unit-12">
    <AdminBreadcrumb :items="[{ label: 'Admin', to: '/admin' }, { label: 'Tenants' }]" />
    <div class="flex items-center justify-between">
      <h1 class="font-display text-headline-lg text-on-surface">Tenants</h1>
      <NuxtLink
        to="/admin/tenants/new"
        class="rounded bg-primary px-unit-4 py-2 font-label text-label-md text-on-primary"
      >
        Provision Tenant
      </NuxtLink>
    </div>

    <p v-if="retryError" class="mt-unit-4 text-error">{{ retryError }}</p>

    <ul class="mt-unit-8 divide-y divide-outline/10">
      <li v-for="tenant in tenantsList" :key="tenant.id" class="flex items-center justify-between py-unit-4">
        <div>
          <p class="text-on-surface">{{ tenant.companyName }}</p>
          <p class="font-label text-label-md text-on-surface-variant">{{ tenant.slug }}</p>
        </div>
        <div class="flex items-center gap-unit-4">
          <span v-if="tenant.simpleAiOsProvisionedAt" class="font-label text-label-md text-on-surface-variant">
            ✓ simple-ai-os
          </span>
          <template v-else>
            <span class="font-label text-label-md text-error">⚠ simple-ai-os not provisioned</span>
            <button
              type="button"
              class="rounded bg-secondary px-unit-3 py-1 font-label text-label-sm text-on-secondary disabled:opacity-50"
              :disabled="retryingSlug === tenant.slug"
              @click="retrySimpleAiOs(tenant.slug)"
            >
              {{ retryingSlug === tenant.slug ? 'Retrying…' : 'Retry' }}
            </button>
          </template>
          <span class="font-label text-label-md text-on-surface-variant">{{ new Date(tenant.createdAt).toLocaleDateString() }}</span>
        </div>
      </li>
    </ul>

    <p v-if="error" class="mt-unit-8 text-on-surface-variant">Couldn't load tenants right now. Please try again shortly.</p>
    <p v-else-if="tenantsList.length === 0" class="mt-unit-8 text-on-surface-variant">No tenants yet.</p>
  </div>
</template>
```

- [ ] **Step 2: Verify the app boots**

Run: `npx nuxt prepare` (from `web/home`)
Expected: no errors

- [ ] **Step 3: Manual verification against a live server** — provision a tenant with the fake
  `simple-ai-os` unreachable (or `NUXT_SIMPLE_AI_OS_URL` unset), confirm the warning badge +
  Retry button appear; point `NUXT_SIMPLE_AI_OS_URL` at a real reachable `simple-ai-os` instance
  (or the smoke-test pattern used in earlier rounds — a temporary local server), click Retry,
  confirm the badge flips to "✓ simple-ai-os" without a page reload.

- [ ] **Step 4: Commit**

```bash
git add app/pages/admin/tenants/index.vue
git commit -m "feat: show simple-ai-os provisioning status and retry action in Tenants admin UI"
```

---

## Task 6: Documentation

**Files:**
- Modify: `docs/backlog.md`
- Modify: `docs/changes.md` (create if it doesn't already track this kind of entry — check first)

- [ ] **Step 1: Remove the "Surface `simple-ai-os` provisioning status in the Tenants admin UI"
  item from `docs/backlog.md`.**

- [ ] **Step 2: Add or append an entry to `docs/changes.md`** (if this project keeps one —
  check for the file first; if it doesn't exist or isn't the convention here, skip this step)
  summarizing the new column, the retry endpoint, and the UI change.

- [ ] **Step 3: Commit**

```bash
git add docs/backlog.md docs/changes.md
git commit -m "docs: record simple-ai-os provisioning status UI as implemented"
```

---

## Self-review notes

- **Spec coverage**: all 4 decisions map to tasks — persisted column (Tasks 1–2), retry
  endpoint (Task 3), UI (Task 5). List endpoint returning the column is Task 3 too.
- **Convention correction from the spec's own wording**: the spec described the retry endpoint
  as `POST /api/admin/tenants/:slug/retry-simple-ai-os` (a dynamic route); Task 3 instead follows
  this codebase's actual established convention for multi/single-tenant admin actions (flat
  route, slug in the body — see `migrate.post.ts`), which achieves the same requirement more
  consistently with the rest of `server/api/admin/tenants/`.
- **Connection-lifetime bug caught during planning**: the original `backfill-simple-ai-os-tenant.ts`
  closed its DB connection (`sql.end()`) right after the initial `select`, before the loop —
  harmless before because the loop never touched `db` again, but Task 2 now needs the loop to
  run `update` calls, so the fix moves `sql.end()` to after the loop.
