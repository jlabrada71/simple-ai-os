import { asc, eq } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { users, type TenantUser } from '../db/schema/tenant'

type Db = ReturnType<typeof drizzle>

export interface TeamMember {
  id: string
  email: string
  role: 'member' | 'admin'
  createdAt: Date
}

export class LastAdminError extends Error {
  constructor() {
    super('Cannot demote the last admin')
  }
}

function toTeamMember(user: TenantUser): TeamMember {
  return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt }
}

export async function listTeam(db: Db): Promise<TeamMember[]> {
  const rows = await db.select().from(users).orderBy(asc(users.createdAt))
  return rows.map(toTeamMember)
}

export async function updateTeamRole(db: Db, userId: string, role: 'member' | 'admin'): Promise<TeamMember | null> {
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return null

  if (target.role === 'admin' && role === 'member') {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'))
    if (admins.length <= 1) {
      throw new LastAdminError()
    }
  }

  const [updated] = await db.update(users).set({ role }).where(eq(users.id, userId)).returning()
  return toTeamMember(updated)
}
