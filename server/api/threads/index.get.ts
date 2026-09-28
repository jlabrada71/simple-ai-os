import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { listThreads } from '../../lib/threads'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  const threads = await withTenantDb(tenant.schemaName, (db) => listThreads(db, user.id))
  return { threads }
})
