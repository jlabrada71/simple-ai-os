import { withTenantDb } from '../db/client'
import { requireTenantSession } from '../utils/requireTenantSession'
import { chat } from '../lib/agent-streaming'
import { chatRequestSchema } from '../../shared/types/chat'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const request = chatRequestSchema.parse(body)
    const { tenant } = await requireTenantSession(event)

    const sessionId = getCookie(event, 'session_id') || crypto.randomUUID()
    setCookie(event, 'session_id', sessionId, { httpOnly: true })

    const stream = await withTenantDb(tenant.schemaName, (db) => Promise.resolve(chat(db, sessionId, request)))

    return sendStream(event, stream)
})
