import { withTenantDb } from '../../../db/client'
import { requireTenantSession } from '../../../utils/requireTenantSession'
import { getThreadForUser, getThreadMessages } from '../../../lib/threads'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  const id = getRouterParam(event, 'id')!

  const messages = await withTenantDb(tenant.schemaName, async (db) => {
    const thread = await getThreadForUser(db, id, user.id)
    if (!thread) return null
    return getThreadMessages(db, id)
  })

  if (messages === null) {
    throw createError({ statusCode: 404, statusMessage: 'Thread not found' })
  }

  return { messages }
})
