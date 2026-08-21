# Tenant-Admin Promotion UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `simple-ai-os`'s `tenant.users.role` field an actual purpose: seed the tenant's
owner as its first admin automatically at provisioning time, then let admins promote/demote
other members from a new `/team` page.

**Architecture:** `home` forwards the owner's email through cross-app provisioning; `simple-ai-os`
stores it as a one-shot `pending_admin_email` marker in the existing `tenant_config` keyed
store; `requireTenantSession`'s first-login user-creation path checks that marker to decide
`role: 'admin'` vs `'member'`. A new `server/lib/team.ts` + `/api/team` routes (admin-only,
guarded by `user.role === 'admin'`) let admins list the team and toggle roles, blocking
demotion of the last remaining admin.

**Tech Stack:** Nuxt 4, TypeScript, Drizzle ORM (`drizzle-orm/node-postgres` in `simple-ai-os`,
`drizzle-orm/postgres-js` in `home`), Vitest.

**Reference:** `docs/superpowers/specs/2026-08-20-tenant-admin-promotion-ui-design.md`

---

## Task 1: Pending-admin-email tenant_config helper (`simple-ai-os`)

**Files:**
- Create: `server/utils/pendingAdminEmail.ts`
- Test: `server/utils/pendingAdminEmail.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/utils/pendingAdminEmail.test.ts
import { describe, expect, it, vi } from 'vitest'
import { setPendingAdminEmail, getPendingAdminEmail, clearPendingAdminEmail } from './pendingAdminEmail'

function fakeDb(overrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    ...overrides,
  } as any
}

describe('pendingAdminEmail', () => {
  it('setPendingAdminEmail inserts a tenant_config row with the lowercased email', async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined)
    const db = fakeDb({ insert: vi.fn(() => ({ values: valuesMock })) })

    await setPendingAdminEmail(db, 'Owner@Example.com')

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'pending_admin_email', value: { email: 'owner@example.com' } }),
    )
  })

  it('getPendingAdminEmail returns null when no row exists', async () => {
    const db = fakeDb()
    await expect(getPendingAdminEmail(db)).resolves.toBeNull()
  })

  it('getPendingAdminEmail returns the stored email when a row exists', async () => {
    const limitMock = vi.fn().mockResolvedValue([{ value: { email: 'owner@example.com' } }])
    const db = fakeDb({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: limitMock })) })) })),
    })

    await expect(getPendingAdminEmail(db)).resolves.toBe('owner@example.com')
  })

  it('clearPendingAdminEmail deletes the tenant_config row', async () => {
    const whereMock = vi.fn().mockResolvedValue(undefined)
    const db = fakeDb({ delete: vi.fn(() => ({ where: whereMock })) })

    await clearPendingAdminEmail(db)

    expect(whereMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/utils/pendingAdminEmail.test.ts`
Expected: FAIL with "Cannot find module './pendingAdminEmail'"

- [ ] **Step 3: Write the implementation**

```typescript
// server/utils/pendingAdminEmail.ts
import { eq } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { tenantConfig } from '../db/schema/tenant'

const PENDING_ADMIN_EMAIL_KEY = 'pending_admin_email'

type TenantDb = ReturnType<typeof drizzle>

export async function setPendingAdminEmail(db: TenantDb, email: string): Promise<void> {
  await db.insert(tenantConfig).values({
    key: PENDING_ADMIN_EMAIL_KEY,
    value: { email: email.trim().toLowerCase() },
  })
}

export async function getPendingAdminEmail(db: TenantDb): Promise<string | null> {
  const [row] = await db.select().from(tenantConfig).where(eq(tenantConfig.key, PENDING_ADMIN_EMAIL_KEY)).limit(1)
  return (row?.value as { email: string } | undefined)?.email ?? null
}

export async function clearPendingAdminEmail(db: TenantDb): Promise<void> {
  await db.delete(tenantConfig).where(eq(tenantConfig.key, PENDING_ADMIN_EMAIL_KEY))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/utils/pendingAdminEmail.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/utils/pendingAdminEmail.ts server/utils/pendingAdminEmail.test.ts
git commit -m "feat: add pending-admin-email tenant_config helper"
```

---

## Task 2: `provisionTenant` accepts an optional owner email

**Files:**
- Modify: `server/lib/provisionTenant.ts`
- Test: `server/lib/provisionTenant.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `server/lib/provisionTenant.test.ts` (keep the existing `vi.mock` calls and the existing
test as-is, add a new mock and a new `it`):

```typescript
// add to the top-level vi.mock block, alongside the existing tenantIamConfig mock:
vi.mock('../utils/pendingAdminEmail', () => ({
  setPendingAdminEmail: vi.fn().mockResolvedValue(undefined),
}))

// add this test inside describe('provisionTenant', ...):
it('stores a pending admin email when provisioning a brand-new tenant with an owner email', async () => {
  const fakeDb = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  }
  const { drizzle } = await import('drizzle-orm/node-postgres')
  ;(drizzle as any).mockReturnValue(fakeDb)

  const { provisionTenant } = await import('./provisionTenant')
  const { setPendingAdminEmail } = await import('../utils/pendingAdminEmail')

  await provisionTenant({ slug: 'acme2', name: 'Acme Two', ownerEmail: 'Owner@Acme.com' })

  expect(setPendingAdminEmail).toHaveBeenCalledWith(fakeDb, 'Owner@Acme.com')
})

it('does not touch pending admin email when ownerEmail is omitted', async () => {
  const fakeDb = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  }
  const { drizzle } = await import('drizzle-orm/node-postgres')
  ;(drizzle as any).mockReturnValue(fakeDb)

  const { provisionTenant } = await import('./provisionTenant')
  const { setPendingAdminEmail } = await import('../utils/pendingAdminEmail')
  ;(setPendingAdminEmail as any).mockClear()

  await provisionTenant({ slug: 'acme3', name: 'Acme Three' })

  expect(setPendingAdminEmail).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/provisionTenant.test.ts`
Expected: FAIL — `setPendingAdminEmail` never called (the source doesn't call it yet)

- [ ] **Step 3: Update the implementation**

In `server/lib/provisionTenant.ts`, add the import and the optional field, and call it after
migrations run (same tenantDb the iam registration step already uses):

```typescript
import { setPendingAdminEmail } from '../utils/pendingAdminEmail'
```

```typescript
export interface ProvisionTenantInput {
  slug: string
  name: string
  ownerEmail?: string
}
```

```typescript
export async function provisionTenant({ slug, name, ownerEmail }: ProvisionTenantInput): Promise<ProvisionTenantResult> {
```

After the `await migrate(tenantDb, { ... })` call and before the `existingIamConfig` block, add:

```typescript
  if (ownerEmail) {
    await setPendingAdminEmail(tenantDb, ownerEmail)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/provisionTenant.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/lib/provisionTenant.ts server/lib/provisionTenant.test.ts
git commit -m "feat: seed a pending admin email when provisioning a tenant with an owner"
```

---

## Task 3: `POST /api/admin/tenants` accepts and forwards `ownerEmail`

**Files:**
- Modify: `server/api/admin/tenants/index.post.ts`

- [ ] **Step 1: Update the route**

Current file:

```typescript
import { requireAdminApiKey } from '../../../utils/adminApiAuth'
import { provisionTenant } from '../../../lib/provisionTenant'

interface ProvisionRequestBody {
  slug?: string
  name?: string
}

const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export default defineEventHandler(async (event) => {
  requireAdminApiKey(event)

  const body = await readBody<ProvisionRequestBody>(event)
  const { slug, name } = body ?? {}

  if (!slug || !name) {
    throw createError({ statusCode: 400, statusMessage: 'slug and name are required' })
  }
  if (!SLUG_REGEX.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Slug must be lowercase letters, numbers, and hyphens only' })
  }

  const result = await provisionTenant({ slug, name })

  return { success: true, slug, schemaName: result.schemaName, alreadyExisted: result.alreadyExisted }
})
```

Replace with:

```typescript
import { requireAdminApiKey } from '../../../utils/adminApiAuth'
import { provisionTenant } from '../../../lib/provisionTenant'

interface ProvisionRequestBody {
  slug?: string
  name?: string
  ownerEmail?: string
}

const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export default defineEventHandler(async (event) => {
  requireAdminApiKey(event)

  const body = await readBody<ProvisionRequestBody>(event)
  const { slug, name, ownerEmail } = body ?? {}

  if (!slug || !name) {
    throw createError({ statusCode: 400, statusMessage: 'slug and name are required' })
  }
  if (!SLUG_REGEX.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Slug must be lowercase letters, numbers, and hyphens only' })
  }

  const result = await provisionTenant({ slug, name, ownerEmail })

  return { success: true, slug, schemaName: result.schemaName, alreadyExisted: result.alreadyExisted }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/admin/tenants/index.post.ts
git commit -m "feat: accept ownerEmail on the tenant provisioning endpoint"
```

---

## Task 4: Bootstrap admin on first login (`requireTenantSession`)

**Files:**
- Modify: `server/utils/requireTenantSession.ts`
- Modify: `server/utils/requireTenantSession.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `server/utils/requireTenantSession.test.ts` in full with:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { users, tenantConfig } from '../db/schema/tenant'

const getIamSessionMock = vi.fn()
vi.stubGlobal('getIamSession', getIamSessionMock)

const usersSelectResult = vi.fn()
const tenantConfigSelectResult = vi.fn()
const apiKeySelectResult = vi.fn()
const insertReturning = vi.fn()
const updateWhereMock = vi.fn().mockResolvedValue(undefined)
const deleteWhereMock = vi.fn().mockResolvedValue(undefined)

vi.mock('../db/client', () => ({
  withTenantDb: async (_schema: string, fn: (db: unknown) => unknown) =>
    fn({
      select: (fields?: unknown) =>
        fields
          ? { from: () => ({ innerJoin: () => ({ where: () => ({ limit: apiKeySelectResult }) }) }) }
          : {
              from: (table: unknown) => ({
                where: () => ({
                  limit: table === tenantConfig ? tenantConfigSelectResult : usersSelectResult,
                }),
              }),
            },
      insert: () => ({ values: () => ({ returning: insertReturning }) }),
      update: () => ({ set: () => ({ where: updateWhereMock }) }),
      delete: () => ({ where: deleteWhereMock }),
    }),
}))

import { requireTenantSession } from './requireTenantSession'

function fakeEvent(tenant: unknown, headers: Record<string, string> = {}) {
  return { context: { tenant }, node: { req: { headers } } } as any
}

describe('requireTenantSession', () => {
  beforeEach(() => {
    getIamSessionMock.mockReset()
    usersSelectResult.mockReset()
    tenantConfigSelectResult.mockReset().mockResolvedValue([])
    apiKeySelectResult.mockReset()
    insertReturning.mockReset()
    updateWhereMock.mockClear()
    deleteWhereMock.mockClear()
  })

  it('throws 404 when no tenant was resolved', async () => {
    await expect(requireTenantSession(fakeEvent(null))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws 401 when there is no bearer token and no iam session', async () => {
    getIamSessionMock.mockResolvedValue(null)
    await expect(requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('auto-creates a tenant user with role member on first login (no pending admin)', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    usersSelectResult.mockResolvedValue([])
    tenantConfigSelectResult.mockResolvedValue([])
    insertReturning.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])

    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))

    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
    expect(result.via).toBe('session')
    expect(deleteWhereMock).not.toHaveBeenCalled()
  })

  it('creates the first login as admin when the email matches the pending admin marker, and clears it', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'Owner@Acme.com' })
    usersSelectResult.mockResolvedValue([])
    tenantConfigSelectResult.mockResolvedValue([{ value: { email: 'owner@acme.com' } }])
    insertReturning.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'Owner@Acme.com', role: 'admin' }])

    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))

    expect(result.user.role).toBe('admin')
    expect(deleteWhereMock).toHaveBeenCalled()
  })

  it('does not grant admin when the pending marker email does not match', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'someone-else@acme.com' })
    usersSelectResult.mockResolvedValue([])
    tenantConfigSelectResult.mockResolvedValue([{ value: { email: 'owner@acme.com' } }])
    insertReturning.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'someone-else@acme.com', role: 'member' }])

    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))

    expect(result.user.role).toBe('member')
    expect(deleteWhereMock).not.toHaveBeenCalled()
  })

  it('returns tenant + user when authenticated and a member (session path)', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    usersSelectResult.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))
    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
    expect(result.via).toBe('session')
  })

  it('resolves via a valid bearer API key without calling getIamSession', async () => {
    apiKeySelectResult.mockResolvedValue([{ apiKey: { id: 'k1' }, user: { id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' } }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }, { authorization: 'Bearer sao_validtoken' }))
    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
    expect(result.via).toBe('apiKey')
    expect(updateWhereMock).toHaveBeenCalled()
    expect(getIamSessionMock).not.toHaveBeenCalled()
  })

  it('falls through to the session check when the bearer token does not match any key', async () => {
    apiKeySelectResult.mockResolvedValue([])
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    usersSelectResult.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }, { authorization: 'Bearer sao_wrongtoken' }))
    expect(result.via).toBe('session')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/utils/requireTenantSession.test.ts`
Expected: FAIL — the two new pending-admin tests fail because the source doesn't check the
marker yet (role is always `'member'` on creation).

- [ ] **Step 3: Update the implementation**

In `server/utils/requireTenantSession.ts`, add the import:

```typescript
import { getPendingAdminEmail, clearPendingAdminEmail } from './pendingAdminEmail'
```

Replace the user-creation block inside `requireTenantSession`:

```typescript
  const user = await withTenantDb(tenant.schemaName, async (db) => {
    const [existing] = await db.select().from(users).where(eq(users.iamSub, session.username)).limit(1)
    if (existing) return existing

    const [created] = await db
      .insert(users)
      .values({ iamSub: session.username, email: session.email, role: 'member' })
      .returning()
    return created
  })
```

with:

```typescript
  const user = await withTenantDb(tenant.schemaName, async (db) => {
    const [existing] = await db.select().from(users).where(eq(users.iamSub, session.username)).limit(1)
    if (existing) return existing

    const pendingAdminEmail = await getPendingAdminEmail(db)
    const isPendingAdmin = pendingAdminEmail !== null && pendingAdminEmail === session.email.trim().toLowerCase()
    if (isPendingAdmin) {
      await clearPendingAdminEmail(db)
    }

    const [created] = await db
      .insert(users)
      .values({ iamSub: session.username, email: session.email, role: isPendingAdmin ? 'admin' : 'member' })
      .returning()
    return created
  })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/utils/requireTenantSession.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add server/utils/requireTenantSession.ts server/utils/requireTenantSession.test.ts
git commit -m "feat: grant admin on first login when the pending admin email matches"
```

---

## Task 5: `server/lib/team.ts` — list and update-role logic

**Files:**
- Create: `server/lib/team.ts`
- Test: `server/lib/team.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/lib/team.test.ts
import { describe, expect, it, vi } from 'vitest'
import { listTeam, updateTeamRole, LastAdminError } from './team'

describe('listTeam', () => {
  it('returns mapped rows ordered by createdAt', async () => {
    const rows = [{ id: 'u1', email: 'a@b.com', role: 'admin', createdAt: new Date('2026-01-01') }]
    const orderByMock = vi.fn().mockResolvedValue(rows)
    const db = { select: () => ({ from: () => ({ orderBy: orderByMock }) }) } as any

    const result = await listTeam(db)

    expect(result).toEqual(rows)
    expect(orderByMock).toHaveBeenCalled()
  })
})

describe('updateTeamRole', () => {
  it('returns null when the user does not exist', async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    } as any

    const result = await updateTeamRole(db, 'missing-id', 'admin')

    expect(result).toBeNull()
  })

  it('updates the role when promoting a member to admin', async () => {
    const updated = { id: 'u1', email: 'a@b.com', role: 'admin', createdAt: new Date('2026-01-01') }
    const returningMock = vi.fn().mockResolvedValue([updated])
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'u1', role: 'member' }] }) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: returningMock }) }) }),
    } as any

    const result = await updateTeamRole(db, 'u1', 'admin')

    expect(result).toEqual(updated)
  })

  it('rejects demoting the sole remaining admin', async () => {
    const db = {
      select: vi.fn()
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [{ id: 'u1', role: 'admin' }] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ id: 'u1' }] }) }),
    } as any

    await expect(updateTeamRole(db, 'u1', 'member')).rejects.toThrow(LastAdminError)
  })

  it('allows demoting one of two admins', async () => {
    const updated = { id: 'u1', email: 'a@b.com', role: 'member', createdAt: new Date('2026-01-01') }
    const returningMock = vi.fn().mockResolvedValue([updated])
    const db = {
      select: vi.fn()
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [{ id: 'u1', role: 'admin' }] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ id: 'u1' }, { id: 'u2' }] }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: returningMock }) }) }),
    } as any

    const result = await updateTeamRole(db, 'u1', 'member')

    expect(result).toEqual(updated)
  })

  it('is a no-op when the role does not change', async () => {
    const updated = { id: 'u1', email: 'a@b.com', role: 'member', createdAt: new Date('2026-01-01') }
    const returningMock = vi.fn().mockResolvedValue([updated])
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'u1', role: 'member' }] }) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: returningMock }) }) }),
    } as any

    const result = await updateTeamRole(db, 'u1', 'member')

    expect(result).toEqual(updated)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/lib/team.test.ts`
Expected: FAIL with "Cannot find module './team'"

- [ ] **Step 3: Write the implementation**

```typescript
// server/lib/team.ts
import { asc, eq } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { users, type TenantUser } from '../db/schema/tenant'

type Db = ReturnType<typeof drizzle>

export interface TeamMember {
  id: string
  email: string
  role: 'member' | 'admin'
  createdAt: Date
}

export class LastAdminError extends Error {
  constructor() {
    super('Cannot demote the last admin')
  }
}

function toTeamMember(user: TenantUser): TeamMember {
  return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt }
}

export async function listTeam(db: Db): Promise<TeamMember[]> {
  const rows = await db.select().from(users).orderBy(asc(users.createdAt))
  return rows.map(toTeamMember)
}

export async function updateTeamRole(db: Db, userId: string, role: 'member' | 'admin'): Promise<TeamMember | null> {
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return null

  if (target.role === 'admin' && role === 'member') {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'))
    if (admins.length <= 1) {
      throw new LastAdminError()
    }
  }

  const [updated] = await db.update(users).set({ role }).where(eq(users.id, userId)).returning()
  return toTeamMember(updated)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/lib/team.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add server/lib/team.ts server/lib/team.test.ts
git commit -m "feat: add team list/update-role logic with last-admin guard"
```

---

## Task 6: `/api/team` routes

**Files:**
- Create: `server/api/team/index.get.ts`
- Create: `server/api/team/[id].patch.ts`

- [ ] **Step 1: Write the GET route**

```typescript
// server/api/team/index.get.ts
import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { listTeam } from '../../lib/team'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }

  const team = await withTenantDb(tenant.schemaName, (db) => listTeam(db))
  return { team }
})
```

- [ ] **Step 2: Write the PATCH route**

```typescript
// server/api/team/[id].patch.ts
import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { updateTeamRole, LastAdminError } from '../../lib/team'

interface UpdateRoleBody {
  role?: 'member' | 'admin'
}

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }

  const body = await readBody<UpdateRoleBody>(event)
  if (body?.role !== 'member' && body?.role !== 'admin') {
    throw createError({ statusCode: 400, statusMessage: "role must be 'member' or 'admin'" })
  }

  const id = getRouterParam(event, 'id')!

  try {
    const updated = await withTenantDb(tenant.schemaName, (db) => updateTeamRole(db, id, body.role!))
    if (!updated) {
      throw createError({ statusCode: 404, statusMessage: 'Unknown user' })
    }
    return { user: updated }
  } catch (error) {
    if (error instanceof LastAdminError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    throw error
  }
})
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, log in as a tenant user seeded as `pending_admin_email` (or manually
`UPDATE tenant_<slug>.users SET role = 'admin' WHERE id = '...'` in a scratch tenant), then:

```bash
curl -b <cookie-jar> http://localhost:3000/api/team
curl -b <cookie-jar> -X PATCH http://localhost:3000/api/team/<other-user-id> \
  -H 'content-type: application/json' -d '{"role":"admin"}'
```

Confirm a 403 from a member session, and a 400 `"Cannot demote the last admin"` when trying to
demote the tenant's only admin.

- [ ] **Step 4: Commit**

```bash
git add server/api/team/index.get.ts server/api/team/[id].patch.ts
git commit -m "feat: add admin-only /api/team list and role-update routes"
```

---

## Task 7: e2e-api coverage for `/api/team`

**Files:**
- Create: `test/e2e-api/team.test.ts`

- [ ] **Step 1: Write the test**

Follow the existing pattern in `test/e2e-api/tenant-isolation.test.ts` and
`test/e2e-api/threads.test.ts` (`ensureTestTenant`, `getTestTenantDb` from
`../helpers/db`) — check `test/helpers/db.ts` for the exact helper signatures before writing
this file, and mirror how `test/e2e-api/threads.test.ts` seeds a `users` row directly via
`getTestTenantDb(schema).insert(users).values(...)` rather than going through a real iam login.

```typescript
// test/e2e-api/team.test.ts
import { eq } from 'drizzle-orm'
import { describe, expect, it, beforeAll } from 'vitest'
import { ensureTestTenant, getTestTenantDb } from '../helpers/db'
import { users } from '../../server/db/schema/tenant'
import { listTeam, updateTeamRole, LastAdminError } from '../../server/lib/team'

describe('team management', () => {
  let db: ReturnType<typeof getTestTenantDb>

  beforeAll(async () => {
    const schema = await ensureTestTenant('e2e-tenant-team', 'Tenant Team')
    db = getTestTenantDb(schema)
    await db.delete(users).where(eq(users.email, 'admin@team.test'))
    await db.delete(users).where(eq(users.email, 'member@team.test'))
  })

  it('lists team members ordered by createdAt, and enforces the last-admin guard end to end', async () => {
    const [admin] = await db.insert(users).values({ iamSub: 'team-admin', email: 'admin@team.test', role: 'admin' }).returning()
    const [member] = await db.insert(users).values({ iamSub: 'team-member', email: 'member@team.test', role: 'member' }).returning()

    const team = await listTeam(db)
    expect(team.map((m) => m.email)).toEqual(expect.arrayContaining(['admin@team.test', 'member@team.test']))

    const promoted = await updateTeamRole(db, member.id, 'admin')
    expect(promoted?.role).toBe('admin')

    const demoted = await updateTeamRole(db, admin.id, 'member')
    expect(demoted?.role).toBe('member')

    await expect(updateTeamRole(db, promoted!.id, 'member')).rejects.toThrow(LastAdminError)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npm run test:e2e-api -- team.test.ts` (or the project's equivalent script — check
`package.json` for the exact e2e-api script name used by `tenant-isolation.test.ts`)
Expected: PASS. This suite talks to a real local Postgres, unlike `home`'s currently-broken
`@nuxt/test-utils` harness — confirm it runs the same way `threads.test.ts` already does before
treating a failure here as a real regression.

- [ ] **Step 3: Commit**

```bash
git add test/e2e-api/team.test.ts
git commit -m "test: add e2e-api coverage for team list/promote/demote"
```

---

## Task 8: `/team` page and nav link

**Files:**
- Create: `app/pages/team.vue`
- Modify: `app/layouts/app.vue`

- [ ] **Step 1: Create the page**

```vue
<!-- app/pages/team.vue -->
<template>
  <div class="team-page">
    <div class="team-header">
      <h1 class="page-title">Team</h1>
    </div>

    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <div v-if="!forbidden" class="table-card">
      <table class="keys-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Joined</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="member in team" :key="member.id">
            <td>{{ member.email }}</td>
            <td>{{ member.role }}</td>
            <td>{{ new Date(member.createdAt).toLocaleString() }}</td>
            <td>
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="isLastAdmin(member)"
                :title="isLastAdmin(member) ? 'Cannot demote the last admin' : ''"
                @click="toggleRole(member)"
              >
                {{ member.role === 'admin' ? 'Demote to member' : 'Promote to admin' }}
              </button>
            </td>
          </tr>
          <tr v-if="team.length === 0">
            <td class="empty-cell" colspan="4">No team members yet.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

definePageMeta({ layout: 'app', middleware: 'auth' })

const team = ref([])
const errorMessage = ref('')
const forbidden = ref(false)

const adminCount = computed(() => team.value.filter((m) => m.role === 'admin').length)
const isLastAdmin = (member) => member.role === 'admin' && adminCount.value <= 1

const fetchTeam = async () => {
  errorMessage.value = ''
  forbidden.value = false
  try {
    const response = await $fetch('/api/team')
    team.value = response.team
  } catch (err) {
    if (err.statusCode === 403) {
      forbidden.value = true
      errorMessage.value = 'Admins only.'
    } else {
      errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to load team'
    }
  }
}

const toggleRole = async (member) => {
  const nextRole = member.role === 'admin' ? 'member' : 'admin'
  errorMessage.value = ''
  try {
    await $fetch(`/api/team/${member.id}`, { method: 'PATCH', body: { role: nextRole } })
    fetchTeam()
  } catch (err) {
    errorMessage.value = err.data?.statusMessage || err.data?.message || 'Failed to update role'
  }
}

fetchTeam()
</script>

<style scoped>
.team-page {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: var(--space-md) var(--space-sm);
}
@media (min-width: 768px) {
  .team-page {
    padding: var(--space-lg) var(--space-margin-desktop);
  }
}

.team-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.page-title {
  font-size: 28px;
  font-weight: 700;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 8px var(--space-sm);
  border-radius: var(--radius-lg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  text-decoration: none;
}
.btn-secondary {
  background-color: var(--color-surface-lowest);
  color: var(--color-on-background);
  border: 1px solid var(--color-outline-variant);
}
.btn-secondary:hover {
  border-color: var(--color-primary-container);
}
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-text {
  color: var(--color-error);
  margin-bottom: var(--space-sm);
}

.table-card {
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-lowest);
  overflow: hidden;
}

.keys-table {
  width: 100%;
  border-collapse: collapse;
}
.keys-table th {
  text-align: left;
  padding: var(--space-sm);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-on-surface-variant);
  border-bottom: 1px solid var(--color-outline-variant);
}
.keys-table td {
  padding: var(--space-sm);
  border-bottom: 1px solid var(--color-outline-variant);
}
.keys-table tbody tr:hover {
  background-color: var(--color-surface-container-low);
}
.keys-table tbody tr:last-child td {
  border-bottom: none;
}

.empty-cell {
  text-align: center;
  padding: var(--space-lg);
  color: var(--color-on-surface-variant);
}
</style>
```

- [ ] **Step 2: Add the nav link**

In `app/layouts/app.vue`, add `const { user } = useAuth()` to the `<script setup>` block
(alongside the existing `const route = useRoute()`), and add a nav link after the API Keys
link:

```vue
          <NuxtLink
            v-if="user?.role === 'admin'"
            to="/team"
            class="app-nav-link"
            :class="{ 'app-nav-link-active': route.path === '/team' }"
          >
            Team
          </NuxtLink>
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`. Log in as a non-admin member — confirm no "Team" nav link appears and
`/team` (direct URL) shows "Admins only." Log in as the pending-admin owner (or a manually
promoted admin) — confirm the nav link appears, the table lists all tenant users, promote/demote
works, and the button is disabled with a tooltip on the sole remaining admin.

- [ ] **Step 4: Commit**

```bash
git add app/pages/team.vue app/layouts/app.vue
git commit -m "feat: add /team page for admins to manage member roles"
```

---

## Task 9: `home` forwards `ownerEmail` through provisioning

**Files:**
- Modify: `server/utils/simpleAiOsProvisioning.ts`
- Modify: `server/api/admin/tenants/index.post.ts`
- Modify: `test/unit/simple-ai-os-provisioning.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/unit/simple-ai-os-provisioning.test.ts`, update the first test's body assertion and
add a new one:

```typescript
it('posts slug, name, and ownerEmail with the admin api key header, and returns the parsed result on success', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, slug: 'acme', schemaName: 'tenant_acme', alreadyExisted: false }),
  }) as any

  const result = await provisionSimpleAiOsTenant({ slug: 'acme', name: 'Acme Co', ownerEmail: 'owner@acme.com' })

  expect(result).toEqual({ ok: true, schemaName: 'tenant_acme', alreadyExisted: false })
  expect(global.fetch).toHaveBeenCalledWith(
    'https://simple-ai-os.tryyourideas.com/api/admin/tenants',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'x-admin-api-key': 'test-key' }),
      body: JSON.stringify({ slug: 'acme', name: 'Acme Co', ownerEmail: 'owner@acme.com' }),
    }),
  )
})

it('omits ownerEmail from the request body when not provided', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, slug: 'acme', schemaName: 'tenant_acme', alreadyExisted: false }),
  }) as any

  await provisionSimpleAiOsTenant({ slug: 'acme', name: 'Acme Co' })

  expect(global.fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ body: JSON.stringify({ slug: 'acme', name: 'Acme Co' }) }),
  )
})
```

Remove (or update in place) the old `'posts slug and name with the admin api key header...'`
test so there isn't a duplicate.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/simple-ai-os-provisioning.test.ts`
Expected: FAIL — the current implementation never includes `ownerEmail` in the body

- [ ] **Step 3: Update the implementation**

```typescript
// server/utils/simpleAiOsProvisioning.ts
export interface ProvisionSimpleAiOsTenantResult {
  ok: boolean
  schemaName?: string
  alreadyExisted?: boolean
}

export async function provisionSimpleAiOsTenant(
  { slug, name, ownerEmail }: { slug: string; name: string; ownerEmail?: string },
): Promise<ProvisionSimpleAiOsTenantResult> {
  const baseUrl = (process.env.NUXT_SIMPLE_AI_OS_URL || '').replace(/\/+$/, '')
  const apiKey = process.env.NUXT_SIMPLE_AI_OS_ADMIN_API_KEY || ''

  try {
    const response = await fetch(`${baseUrl}/api/admin/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-api-key': apiKey,
      },
      body: JSON.stringify(ownerEmail ? { slug, name, ownerEmail } : { slug, name }),
    })

    if (!response.ok) {
      console.error(`simple-ai-os tenant provisioning failed with status ${response.status}: ${await response.text()}`)
      return { ok: false }
    }

    const data = (await response.json()) as { schemaName: string; alreadyExisted: boolean }
    return { ok: true, schemaName: data.schemaName, alreadyExisted: data.alreadyExisted }
  } catch (error) {
    console.error('simple-ai-os tenant provisioning request threw:', error)
    return { ok: false }
  }
}
```

Then in `server/api/admin/tenants/index.post.ts`, change the initial provisioning call from:

```typescript
    const result = await provisionSimpleAiOsTenant({ slug, name })
```

to:

```typescript
    const result = await provisionSimpleAiOsTenant({ slug, name, ownerEmail: ownerEmail.trim().toLowerCase() })
```

(`ownerEmail` is already validated non-empty by the existing `EMAIL_REGEX` check earlier in
this handler, so no new validation is needed here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/simple-ai-os-provisioning.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/simpleAiOsProvisioning.ts server/api/admin/tenants/index.post.ts test/unit/simple-ai-os-provisioning.test.ts
git commit -m "feat: forward ownerEmail to simple-ai-os so it can seed the tenant's first admin"
```

---

## Task 10: `retry-simple-ai-os` also forwards the owner's email

**Files:**
- Modify: `server/api/admin/tenants/retry-simple-ai-os.post.ts`

- [ ] **Step 1: Update the route**

Current file:

```typescript
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

Replace with (looks up the tenant's earliest local user row — the owner, created at the
tenant's own provisioning time — to pass along as `ownerEmail`; falls back to no email if the
tenant somehow has no local user row yet):

```typescript
import { asc, eq } from 'drizzle-orm'
import { requireAdminSession } from '../../../utils/adminAuth'
import { publicDb, withTenantDb } from '../../../db/client'
import { tenants } from '../../../db/schema/public'
import { users } from '../../../db/schema/tenant'
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

  const [owner] = await withTenantDb(tenant.schemaName, (db) =>
    db.select({ email: users.email }).from(users).orderBy(asc(users.createdAt)).limit(1),
  )

  const result = await provisionSimpleAiOsTenant({ slug: tenant.slug, name: tenant.companyName, ownerEmail: owner?.email })
  if (!result.ok) {
    throw createError({ statusCode: 502, statusMessage: 'simple-ai-os provisioning failed — retry is safe' })
  }

  await publicDb.update(tenants).set({ simpleAiOsProvisionedAt: new Date() }).where(eq(tenants.slug, slug))

  return { success: true, slug, simpleAiOsProvisionedAt: new Date().toISOString() }
})
```

Check `server/db/client.ts` for the exact exported name of the tenant-scoped db helper
(`withTenantDb` is the name used elsewhere in `home`, e.g. `server/api/admin/tenants/index.post.ts`
— confirm it matches before using it here) and confirm `users` is exported from
`server/db/schema/tenant.ts` (it is — used identically in `index.post.ts`).

- [ ] **Step 2: Commit**

```bash
git add server/api/admin/tenants/retry-simple-ai-os.post.ts
git commit -m "feat: forward the tenant owner's email on simple-ai-os provisioning retry"
```

---

## Task 11: Documentation

**Files:**
- Create: `docs/architecture/ADR/0007-tenant-admin-bootstrap-via-pending-email-marker.md` (simple-ai-os)
- Modify: `docs/backlog.md` (simple-ai-os)
- Modify: `docs/changes.md` (simple-ai-os)
- Modify: `docs/changes.md` (home)
- Modify: `docs/user-guides/features.md`, `docs/user-guides/manual.md` (simple-ai-os, if they exist — check first)

- [ ] **Step 1: Write the ADR**

```markdown
# ADR-0007: Bootstrap the first tenant admin via a pending-email marker in tenant_config

## Status

Accepted (2026-08-21)

## Context

`tenant.users.role` (`'member' | 'admin'`) existed since phase 1 but was never actually checked
anywhere, and every new user was created as `'member'` — there was no admin at all until an
operator manually ran an `UPDATE` against a tenant's schema. The new `/team` page needs at
least one admin to exist for a tenant to be self-service.

## Decision

`home` forwards the tenant owner's email (already collected at provisioning time) to
`simple-ai-os`'s `POST /api/admin/tenants`. `simple-ai-os` stores it as a one-shot
`pending_admin_email` entry in the existing `tenant_config` keyed store (the same table already
used for per-app `iam` integration config). `requireTenantSession`'s first-login user-creation
path checks this marker: a matching email becomes `role: 'admin'` and the marker is deleted;
everyone else is `'member'`, unchanged from today.

Rejected alternative: making `users.iam_sub` nullable and pre-seeding a real `users` row for
the owner before they ever log in. This would need a schema migration, a nullable unique
column, and careful "claim this row on matching login" logic — strictly more moving parts than
reusing the existing keyed-config table for a value that only needs to survive until the first
matching login.

## Consequences

- Tenants provisioned through `home` (which always has an owner email) get a self-service admin
  automatically, with no manual DB step.
- Tenants provisioned via the `simple-ai-os` CLI script or backfill script without an owner
  email still land with zero admins, same as before this change — an operator still promotes
  the first admin manually via SQL in that path. This is an accepted, unchanged gap (see
  `docs/backlog.md`).
- `role` is now load-bearing for exactly one thing: `/team` access. Prompts, chat, and API keys
  remain open to all authenticated tenant members.
```

- [ ] **Step 2: Update `docs/backlog.md` (simple-ai-os)**

Replace the "Tenant-admin promotion UI" section with:

```markdown
## Tenant-admin promotion UI

**Done (2026-08-21).** `home` forwards the tenant owner's email through provisioning;
`simple-ai-os` seeds them as the tenant's first admin via a one-shot `pending_admin_email`
marker in `tenant_config`, claimed on their first SSO login. Admins manage roles from the new
`/team` page (`GET`/`PATCH /api/team`), which blocks demoting the last remaining admin. See
`docs/superpowers/specs/2026-08-20-tenant-admin-promotion-ui-design.md` and
`docs/architecture/ADR/0007-tenant-admin-bootstrap-via-pending-email-marker.md`.

**Remaining gap** (unchanged, accepted): a tenant provisioned without an owner email (CLI
script, backfill script) still has zero admins until one is promoted manually via SQL.
```

- [ ] **Step 3: Update `docs/changes.md` (simple-ai-os)**

Prepend a new entry at the top, under the `# Changes` header, following the exact format of the
existing entries (see the current top entry for the pattern):

```markdown
## 2026-08-21 (tenant-admin promotion UI)

- **Tenant-admin promotion UI**: `tenant.users.role` is now load-bearing. `home` forwards the
  tenant owner's email through cross-app provisioning; `simple-ai-os` seeds them as the
  tenant's first admin on their first SSO login via a one-shot `pending_admin_email` marker
  in `tenant_config` (no schema change). Admins manage the team from a new `/team` page
  (`GET`/`PATCH /api/team`, admin-only), which blocks demoting the last remaining admin. See
  `docs/superpowers/specs/2026-08-20-tenant-admin-promotion-ui-design.md` and
  `docs/architecture/ADR/0007-tenant-admin-bootstrap-via-pending-email-marker.md`.
```

- [ ] **Step 4: Update `docs/changes.md` (home)**

Prepend a matching entry to `home`'s `docs/changes.md`:

```markdown
## 2026-08-21 (tenant-admin promotion UI in simple-ai-os)

- **Forward the tenant owner's email to simple-ai-os provisioning**: both
  `POST /api/admin/tenants` and `POST /api/admin/tenants/retry-simple-ai-os` now pass
  `ownerEmail` (looked up from the tenant's own local `users` table for the retry path) so
  `simple-ai-os` can seed that person as the tenant's first admin. See
  `simple-ai-os/docs/superpowers/specs/2026-08-20-tenant-admin-promotion-ui-design.md`.
```

- [ ] **Step 5: Update user-guides (simple-ai-os)**

Check whether `docs/user-guides/features.md` and `docs/user-guides/manual.md` exist. If they
do, add a short "Team management" entry to `features.md` (one paragraph: admins can view the
team and promote/demote roles from `/team`) and a step-by-step section to `manual.md` (how to
find `/team`, what promote/demote does, the last-admin restriction) matching the existing
entries' structure and depth for the API Keys feature. If they don't exist yet in this repo,
skip this step — creating the full user-guide set from scratch is out of scope for this task.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/ADR/0007-tenant-admin-bootstrap-via-pending-email-marker.md docs/backlog.md docs/changes.md docs/user-guides/*.md
git commit -m "docs: record tenant-admin promotion UI (ADR, backlog, changes, user-guides)"
```

```bash
cd ../home
git add docs/changes.md
git commit -m "docs: record ownerEmail forwarding for simple-ai-os tenant-admin bootstrap"
```

---

## Final verification

- [ ] Run the full `simple-ai-os` unit test suite: `npm test` (or `npx vitest run`) — confirm no
      regressions beyond the new/changed files above.
- [ ] Run `simple-ai-os`'s e2e-api suite (same script `tenant-isolation.test.ts` already runs
      under) and confirm `test/e2e-api/team.test.ts` passes against a real local Postgres.
- [ ] Run `home`'s unit test suite: `npm test` — confirm no regressions.
- [ ] Manual walk-through end to end (documented in Task 8, Step 3): provision a brand-new
      tenant from `home` with a real owner email, confirm that owner logging into `simple-ai-os`
      lands as admin, confirm `/team` shows them, promote a second user, demote the original
      admin, confirm the last-admin guard blocks demoting the sole remaining admin.
- [ ] Proceed to `superpowers:finishing-a-development-branch` once all tasks are checked off.
