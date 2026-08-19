import { withTenantDb } from '../db/client'
import { requireTenantSession } from '../utils/requireTenantSession'
import { chat } from '../lib/agent'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { tenant } = await requireTenantSession(event)

    const sessionId = getCookie(event, 'session_id') || crypto.randomUUID()
    setCookie(event, 'session_id', sessionId, { httpOnly: true })

    const response = await withTenantDb(tenant.schemaName, (db) => chat(db, sessionId, body.value))

    return response
})
