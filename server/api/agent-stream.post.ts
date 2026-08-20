import { withTenantDb } from '../db/client'
import { requireTenantSession } from '../utils/requireTenantSession'
import { chat } from '../lib/agent-streaming'
import { chatRequestSchema } from '../../shared/types/chat'
import { getThreadForUser } from '../lib/threads'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const request = chatRequestSchema.parse(body)
    const { tenant, user } = await requireTenantSession(event)

    const stream = await withTenantDb(tenant.schemaName, async (db) => {
        const thread = await getThreadForUser(db, request.threadId, user.id)
        if (!thread) {
            throw createError({ statusCode: 404, statusMessage: 'Thread not found' })
        }
        return chat(db, thread.id, request)
    })

    return sendStream(event, stream)
})
