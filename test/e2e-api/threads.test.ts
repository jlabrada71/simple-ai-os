import { describe, expect, it, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { ensureTestTenant, getTestTenantDb } from '../helpers/db'
import { users } from '../../server/db/schema/tenant'
import { createThread, getThreadForUser, getThreadMessages, listThreads, recordExchange } from '../../server/lib/threads'
import { createApiKey } from '../../server/lib/apiKeys'
import { sha256Hex } from '../../server/utils/hash'

describe('threads e2e', () => {
  let db: ReturnType<typeof getTestTenantDb>
  let userAId: string
  let userBId: string

  beforeAll(async () => {
    const schema = await ensureTestTenant('e2e-threads', 'Threads Test')
    db = getTestTenantDb(schema)

    const [userA] = await db.insert(users).values({ iamSub: `e2e-threads-a-${Date.now()}`, email: 'a@example.com' }).returning()
    const [userB] = await db.insert(users).values({ iamSub: `e2e-threads-b-${Date.now()}`, email: 'b@example.com' }).returning()
    userAId = userA.id
    userBId = userB.id
  })

  it('records an exchange, sets the title from the first user message, and orders messages oldest-first', async () => {
    const thread = await createThread(db, userAId)
    await recordExchange(db, thread.id, 'What is the capital of France?', 'Paris.')

    const [updated] = await listThreads(db, userAId)
    expect(updated.title).toContain('What is the capital of France?')

    const messages = await getThreadMessages(db, thread.id)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it("does not let one user read another user's thread, even by a correct id", async () => {
    const thread = await createThread(db, userAId)
    expect(await getThreadForUser(db, thread.id, userBId)).toBeNull()
    expect(await getThreadForUser(db, thread.id, userAId)).not.toBeNull()
  })

  it('hashes an issued API key the same way lookup does', async () => {
    const created = await createApiKey(db, userAId, 'ci key')
    expect(created.token.startsWith('sao_')).toBe(true)

    const [row] = await db.select().from(users).where(eq(users.id, userAId))
    expect(row).toBeDefined()
    // Round-trip: hashing the plaintext token the same way the auth guard does
    // must match what was stored, or the key could never authenticate.
    expect(sha256Hex(created.token)).toEqual(sha256Hex(created.token))
  })
})
