import { eq } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { tenantConfig } from '../db/schema/tenant'
import { encryptSecret, decryptSecret } from './tenantSecretCrypto'

const IAM_INTEGRATION_KEY = 'iam_integration'

export interface TenantIamAppConfig {
  appId: string
  clientSecret: string
  authenticatedUrl: string
  notAuthenticatedUrl: string
}

type TenantDb = ReturnType<typeof drizzle>

interface StoredIamIntegration {
  [applicationName: string]: {
    appId: string
    clientSecretEncrypted: string
    authenticatedUrl: string
    notAuthenticatedUrl: string
    registeredAt: string
  }
}

async function readIamIntegration(db: TenantDb): Promise<StoredIamIntegration> {
  try {
    const [row] = await db.select().from(tenantConfig).where(eq(tenantConfig.key, IAM_INTEGRATION_KEY)).limit(1)
    return (row?.value as StoredIamIntegration | undefined) ?? {}
  } catch (error) {
    // A tenant whose schema predates the tenant_config migration (or
    // hasn't been migrated yet) has no tenant_config table at all - that's
    // "no iam app registered", not an error.
    const cause = error instanceof Error ? (error as { cause?: { code?: string } }).cause : undefined
    if (cause?.code === '42P01') return {}
    throw error
  }
}

export async function storeTenantIamAppConfig(
  db: TenantDb,
  applicationName: string,
  app: { appId: string; clientSecret: string; authenticatedUrl: string; notAuthenticatedUrl: string },
): Promise<void> {
  const existing = await readIamIntegration(db)
  const value: StoredIamIntegration = {
    ...existing,
    [applicationName]: {
      appId: app.appId,
      clientSecretEncrypted: encryptSecret(app.clientSecret),
      authenticatedUrl: app.authenticatedUrl,
      notAuthenticatedUrl: app.notAuthenticatedUrl,
      registeredAt: new Date().toISOString(),
    },
  }

  await db
    .insert(tenantConfig)
    .values({ key: IAM_INTEGRATION_KEY, value })
    .onConflictDoUpdate({ target: tenantConfig.key, set: { value, updatedAt: new Date() } })
}

export async function getTenantIamAppConfig(db: TenantDb, applicationName: string): Promise<TenantIamAppConfig | null> {
  const integration = await readIamIntegration(db)
  const entry = integration[applicationName]
  if (!entry) return null
  return {
    appId: entry.appId,
    clientSecret: decryptSecret(entry.clientSecretEncrypted),
    authenticatedUrl: entry.authenticatedUrl,
    notAuthenticatedUrl: entry.notAuthenticatedUrl,
  }
}
