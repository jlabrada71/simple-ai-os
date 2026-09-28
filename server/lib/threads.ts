import { desc, eq, sql } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { threads, threadMessages, type Thread, type ThreadMessage } from '../db/schema/tenant'

type Db = ReturnType<typeof drizzle>

const TITLE_MAX_LENGTH = 50

function deriveTitle(userMessage: string): string {
  const trimmed = userMessage.trim()
  return trimmed.length > TITLE_MAX_LENGTH ? `${trimmed.slice(0, TITLE_MAX_LENGTH)}…` : trimmed
}

export async function createThread(db: Db, userId: string): Promise<Thread> {
  const [thread] = await db.insert(threads).values({ userId }).returning()
  return thread
}

export async function listThreads(db: Db, userId: string): Promise<Thread[]> {
  return db.select().from(threads).where(eq(threads.userId, userId)).orderBy(desc(threads.updatedAt))
}

export async function getThreadForUser(db: Db, threadId: string, userId: string): Promise<Thread | null> {
  const [thread] = await db
    .select()
    .from(threads)
    .where(sql`${threads.id} = ${threadId} and ${threads.userId} = ${userId}`)
    .limit(1)
  return thread ?? null
}

export async function getOrCreateLatestThread(db: Db, userId: string): Promise<Thread> {
  const [latest] = await db
    .select()
    .from(threads)
    .where(eq(threads.userId, userId))
    .orderBy(desc(threads.updatedAt))
    .limit(1)
  if (latest) return latest
  return createThread(db, userId)
}

export async function getThreadMessages(db: Db, threadId: string): Promise<ThreadMessage[]> {
  return db.select().from(threadMessages).where(eq(threadMessages.threadId, threadId)).orderBy(threadMessages.createdAt)
}

export async function recordExchange(
  db: Db,
  threadId: string,
  userContent: string,
  assistantContent: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [thread] = await tx.select().from(threads).where(eq(threads.id, threadId)).limit(1)

    await tx.insert(threadMessages).values({ threadId, role: 'user', content: userContent })
    await tx.insert(threadMessages).values({ threadId, role: 'assistant', content: assistantContent })

    await tx
      .update(threads)
      .set({
        title: thread?.title ?? deriveTitle(userContent),
        updatedAt: sql`now()`,
      })
      .where(eq(threads.id, threadId))
  })
}
