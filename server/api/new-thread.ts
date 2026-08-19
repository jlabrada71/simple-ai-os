import { requireTenantSession } from '../utils/requireTenantSession'

// Starts a fresh fs-backed chat session for the authenticated tenant user by
// issuing a new session_id cookie - the old session's { messages,
// claudeResponse } blob is simply orphaned (unstorage 'session' namespace
// has no size-based eviction here; see docs/backlog.md's WP-3/WP-4 items
// for the DB-backed threads/messages model that replaces this).
export default defineEventHandler(async (event) => {
  await requireTenantSession(event)
  const sessionId = crypto.randomUUID()
  setCookie(event, 'session_id', sessionId, { httpOnly: true })
  return { success: true }
})
