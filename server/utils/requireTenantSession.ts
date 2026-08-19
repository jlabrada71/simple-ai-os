import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { withTenantDb } from '../db/client'
import { users, type TenantUser } from '../db/schema/tenant'
import type { TenantContext } from './tenant'

export interface TenantSession {
  tenant: TenantContext
  user: TenantUser
}

export async function requireTenantSession(event: H3Event): Promise<TenantSession> {
  const tenant = event.context.tenant as TenantContext | null
  if (!tenant) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown tenant' })
  }

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

  return { tenant, user }
}
