import { describe, expect, it, vi } from 'vitest'
import { listTeam, updateTeamRole, LastAdminError } from './team'

describe('listTeam', () => {
  it('returns mapped rows ordered by createdAt', async () => {
    const rows = [{ id: 'u1', email: 'a@b.com', role: 'admin', createdAt: new Date('2026-01-01') }]
    const orderByMock = vi.fn().mockResolvedValue(rows)
    const db = { select: () => ({ from: () => ({ orderBy: orderByMock }) }) } as any

    const result = await listTeam(db)

    expect(result).toEqual(rows)
    expect(orderByMock).toHaveBeenCalled()
  })
})

describe('updateTeamRole', () => {
  it('returns null when the user does not exist', async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    } as any

    const result = await updateTeamRole(db, 'missing-id', 'admin')

    expect(result).toBeNull()
  })

  it('updates the role when promoting a member to admin', async () => {
    const updated = { id: 'u1', email: 'a@b.com', role: 'admin', createdAt: new Date('2026-01-01') }
    const returningMock = vi.fn().mockResolvedValue([updated])
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'u1', role: 'member' }] }) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: returningMock }) }) }),
    } as any

    const result = await updateTeamRole(db, 'u1', 'admin')

    expect(result).toEqual(updated)
  })

  it('rejects demoting the sole remaining admin', async () => {
    const db = {
      select: vi.fn()
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [{ id: 'u1', role: 'admin' }] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ id: 'u1' }] }) }),
    } as any

    await expect(updateTeamRole(db, 'u1', 'member')).rejects.toThrow(LastAdminError)
  })

  it('allows demoting one of two admins', async () => {
    const updated = { id: 'u1', email: 'a@b.com', role: 'member', createdAt: new Date('2026-01-01') }
    const returningMock = vi.fn().mockResolvedValue([updated])
    const db = {
      select: vi.fn()
        .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: async () => [{ id: 'u1', role: 'admin' }] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ id: 'u1' }, { id: 'u2' }] }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: returningMock }) }) }),
    } as any

    const result = await updateTeamRole(db, 'u1', 'member')

    expect(result).toEqual(updated)
  })

  it('is a no-op when the role does not change', async () => {
    const updated = { id: 'u1', email: 'a@b.com', role: 'member', createdAt: new Date('2026-01-01') }
    const returningMock = vi.fn().mockResolvedValue([updated])
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'u1', role: 'member' }] }) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: returningMock }) }) }),
    } as any

    const result = await updateTeamRole(db, 'u1', 'member')

    expect(result).toEqual(updated)
  })
})
