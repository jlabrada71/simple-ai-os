import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { deletePrompt } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantSession(event)
  const id = getRouterParam(event, 'id')!
  const prompt = await withTenantDb(tenant.schemaName, (db) => deletePrompt(db, id))
  if (!prompt) {
    throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })
  }
  return prompt
})
