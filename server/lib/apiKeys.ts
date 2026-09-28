import { randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { apiKeys } from '../db/schema/tenant'
import { sha256Hex } from '../utils/hash'

type Db = ReturnType<typeof drizzle>

export interface CreatedApiKey {
  id: string
  name: string | null
  token: string
  createdAt: Date
}

function generateToken(): string {
  return `sao_${randomBytes(32).toString('base64url')}`
}

export async function createApiKey(db: Db, userId: string, name?: string): Promise<CreatedApiKey> {
  const token = generateToken()
  const [row] = await db
    .insert(apiKeys)
    .values({ userId, name: name ?? null, keyHash: sha256Hex(token) })
    .returning()

  return { id: row.id, name: row.name, token, createdAt: row.createdAt }
}

export async function listApiKeys(db: Db, userId: string) {
  return db
    .select({ id: apiKeys.id, name: apiKeys.name, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt))
}

export async function deleteApiKey(db: Db, keyId: string, userId: string): Promise<void> {
  await db.delete(apiKeys).where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
}
