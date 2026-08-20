import { eq, sql } from 'drizzle-orm'
import { createError, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { withTenantDb } from '../db/client'
import { users, apiKeys, type TenantUser } from '../db/schema/tenant'
import { sha256Hex } from './hash'
import type { TenantContext } from './tenant'

export interface TenantSession {
  tenant: TenantContext
  user: TenantUser
  via: 'session' | 'apiKey'
}

async function resolveViaApiKey(event: H3Event, tenant: TenantContext): Promise<TenantSession | null> {
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null

  return withTenantDb(tenant.schemaName, async (db) => {
    const keyHash = sha256Hex(token)
    const [row] = await db
      .select({ apiKey: apiKeys, user: users })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1)
    if (!row) return null

    await db.update(apiKeys).set({ lastUsedAt: sql`now()` }).where(eq(apiKeys.id, row.apiKey.id))

    return { tenant, user: row.user, via: 'apiKey' as const }
  })
}

export async function requireTenantSession(event: H3Event): Promise<TenantSession> {
  const tenant = event.context.tenant as TenantContext | null
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown tenant' })
  }

  const viaApiKey = await resolveViaApiKey(event, tenant)
  if (viaApiKey) return viaApiKey

  const session = await getIamSession(event, 'tenant')
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const user = await withTenantDb(tenant.schemaName, async (db) => {
    const [existing] = await db.select().from(users).where(eq(users.iamSub, session.username)).limit(1)
    if (existing) return existing

    const [created] = await db
      .insert(users)
      .values({ iamSub: session.username, email: session.email, role: 'member' })
      .returning()
    return created
  })

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  return { tenant, user, via: 'session' }
}
