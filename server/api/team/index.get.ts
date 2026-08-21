import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { listTeam } from '../../lib/team'

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }

  const team = await withTenantDb(tenant.schemaName, (db) => listTeam(db))
  return { team }
})
