import { ZodError } from 'zod'
import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { listPrompts } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantSession(event)
  const query = getQuery(event)
  try {
    return await withTenantDb(tenant.schemaName, (db) => listPrompts(db, query))
  } catch (err) {
    if (err instanceof ZodError) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid query parameters', data: err.issues })
    }
    throw err
  }
})
