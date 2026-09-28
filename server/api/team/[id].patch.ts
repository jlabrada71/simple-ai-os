import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { updateTeamRole, LastAdminError } from '../../lib/team'

interface UpdateRoleBody {
  role?: 'member' | 'admin'
}

export default defineEventHandler(async (event) => {
  const { tenant, user } = await requireTenantSession(event)
  if (user.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }

  const body = await readBody<UpdateRoleBody>(event)
  if (body?.role !== 'member' && body?.role !== 'admin') {
    throw createError({ statusCode: 400, statusMessage: "role must be 'member' or 'admin'" })
  }

  const id = getRouterParam(event, 'id')!

  try {
    const updated = await withTenantDb(tenant.schemaName, (db) => updateTeamRole(db, id, body.role!))
    if (!updated) {
      throw createError({ statusCode: 404, statusMessage: 'Unknown user' })
    }
    return { user: updated }
  } catch (error) {
    if (error instanceof LastAdminError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    throw error
  }
})
