import { eq } from 'drizzle-orm'
import { describe, expect, it, beforeAll } from 'vitest'
import { ensureTestTenant, getTestTenantDb } from '../helpers/db'
import { users } from '../../server/db/schema/tenant'
import { listTeam, updateTeamRole, LastAdminError } from '../../server/lib/team'

describe('team management', () => {
  let db: ReturnType<typeof getTestTenantDb>

  beforeAll(async () => {
    const schema = await ensureTestTenant('e2e-tenant-team', 'Tenant Team')
    db = getTestTenantDb(schema)
    await db.delete(users).where(eq(users.email, 'admin@team.test'))
    await db.delete(users).where(eq(users.email, 'member@team.test'))
  })

  it('lists team members ordered by createdAt, and enforces the last-admin guard end to end', async () => {
    const [admin] = await db.insert(users).values({ iamSub: 'team-admin', email: 'admin@team.test', role: 'admin' }).returning()
    const [member] = await db.insert(users).values({ iamSub: 'team-member', email: 'member@team.test', role: 'member' }).returning()

    const team = await listTeam(db)
    expect(team.map((m) => m.email)).toEqual(expect.arrayContaining(['admin@team.test', 'member@team.test']))

    const promoted = await updateTeamRole(db, member.id, 'admin')
    expect(promoted?.role).toBe('admin')

    const demoted = await updateTeamRole(db, admin.id, 'member')
    expect(demoted?.role).toBe('member')

    await expect(updateTeamRole(db, promoted!.id, 'member')).rejects.toThrow(LastAdminError)
  })
})
