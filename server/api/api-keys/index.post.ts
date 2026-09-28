import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { createApiKey } from '../../lib/apiKeys'

interface CreateApiKeyBody {
  name?: string
}

export default defineEventHandler(async (event) => {
  const { tenant, user, via } = await requireTenantSession(event)
  if (via !== 'session') {
    throw createError({ statusCode: 401, statusMessage: 'API keys must be created with a browser session, not another API key' })
  }

  const body = await readBody<CreateApiKeyBody>(event)
  const created = await withTenantDb(tenant.schemaName, (db) => createApiKey(db, user.id, body?.name))

  setResponseStatus(event, 201)
  return created
})
