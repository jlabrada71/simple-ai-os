import { withTenantDb } from '../../db/client'
import { requireTenantSession } from '../../utils/requireTenantSession'
import { getPrompt } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantSession(event)
  const id = getRouterParam(event, 'id')!
  const prompt = await withTenantDb(tenant.schemaName, (db) => getPrompt(db, id))
  if (!prompt) {
    throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })
  }
  return prompt
})
