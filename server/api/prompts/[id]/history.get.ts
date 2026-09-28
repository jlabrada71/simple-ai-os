import { withTenantDb } from '../../../db/client'
import { requireTenantSession } from '../../../utils/requireTenantSession'
import { listPromptHistory } from '../../../lib/prompts'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantSession(event)
  const id = getRouterParam(event, 'id')!
  const history = await withTenantDb(tenant.schemaName, (db) => listPromptHistory(db, id))
  return { history }
})
