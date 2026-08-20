import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { createThread } from '../../lib/threads'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  const thread = await withTenantDb(tenant.schemaName, (db) => createThread(db, user.id))
  setResponseStatus(event, 201)
  return thread
})
