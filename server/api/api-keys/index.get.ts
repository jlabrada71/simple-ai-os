import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { listApiKeys } from '../../lib/apiKeys'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  const apiKeys = await withTenantDb(tenant.schemaName, (db) => listApiKeys(db, user.id))
  return { apiKeys }
})
