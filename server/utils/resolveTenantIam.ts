import type { H3Event } from 'h3'
import { withTenantDb } from '../db/client'
import { getTenantIamAppConfig } from './tenantIamConfig'

/**
 * Auto-imported by nuxt-iam-client's dynamic mode for the tenant mount.
 * Named exactly `resolveIamAppCredentials` per that module's contract.
 */
export async function resolveIamAppCredentials(event: H3Event) {
  const tenant = event.context.tenant as { schemaName: string } | undefined
  if (!tenant) return null

  const config = await withTenantDb(tenant.schemaName, (db) => getTenantIamAppConfig(db, 'simple-ai-os'))
  if (!config) return null

  return {
    url: process.env.NUXT_IAM_URL || '',
    appId: config.appId,
    appSecret: config.clientSecret,
  }
}
