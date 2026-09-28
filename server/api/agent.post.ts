import { withTenantDb } from '../db/client'
import { requireTenantSession } from '../utils/requireTenantSession'
import { chat } from '../lib/agent'
import { getOrCreateLatestThread } from '../lib/threads'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { tenant, user } = await requireTenantSession(event)

    const response = await withTenantDb(tenant.schemaName, async (db) => {
        const thread = await getOrCreateLatestThread(db, user.id)
        return chat(db, thread.id, body.value)
    })

    return response
})
