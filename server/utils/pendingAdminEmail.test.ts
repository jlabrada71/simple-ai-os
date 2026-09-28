import { describe, expect, it, vi } from 'vitest'
import { setPendingAdminEmail, getPendingAdminEmail, clearPendingAdminEmail } from './pendingAdminEmail'

function fakeDb(overrides: Record<string, unknown> = {}) {
  return {
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    ...overrides,
  } as any
}

describe('pendingAdminEmail', () => {
  it('setPendingAdminEmail inserts a tenant_config row with the lowercased email', async () => {
    const valuesMock = vi.fn().mockResolvedValue(undefined)
    const db = fakeDb({ insert: vi.fn(() => ({ values: valuesMock })) })

    await setPendingAdminEmail(db, 'Owner@Example.com')

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'pending_admin_email', value: { email: 'owner@example.com' } }),
    )
  })

  it('getPendingAdminEmail returns null when no row exists', async () => {
    const db = fakeDb()
    await expect(getPendingAdminEmail(db)).resolves.toBeNull()
  })

  it('getPendingAdminEmail returns the stored email when a row exists', async () => {
    const limitMock = vi.fn().mockResolvedValue([{ value: { email: 'owner@example.com' } }])
    const db = fakeDb({
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: limitMock })) })) })),
    })

    await expect(getPendingAdminEmail(db)).resolves.toBe('owner@example.com')
  })

  it('clearPendingAdminEmail deletes the tenant_config row', async () => {
    const whereMock = vi.fn().mockResolvedValue(undefined)
    const db = fakeDb({ delete: vi.fn(() => ({ where: whereMock })) })

    await clearPendingAdminEmail(db)

    expect(whereMock).toHaveBeenCalled()
  })
})
