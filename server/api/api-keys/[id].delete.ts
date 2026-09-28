import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { deleteApiKey } from '../../lib/apiKeys'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  const id = getRouterParam(event, 'id')!
  await withTenantDb(tenant.schemaName, (db) => deleteApiKey(db, id, user.id))
  return { success: true }
})
