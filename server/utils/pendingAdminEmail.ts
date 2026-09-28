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
