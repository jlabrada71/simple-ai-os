import { describe, expect, it, vi } from 'vitest'

const getIamSessionMock = vi.fn()
vi.stubGlobal('getIamSession', getIamSessionMock)

const selectResult = vi.fn()
const insertResult = vi.fn()
vi.mock('../db/client', () => ({
  withTenantDb: async (_schema: string, fn: (db: unknown) => unknown) =>
    fn({
      select: () => ({ from: () => ({ where: () => ({ limit: selectResult }) }) }),
      insert: () => ({ values: () => ({ returning: insertResult }) }),
    }),
}))

import { requireTenantSession } from './requireTenantSession'

describe('requireTenantSession', () => {
  it('throws 404 when no tenant was resolved', async () => {
    const event = { context: { tenant: null } } as any
    await expect(requireTenantSession(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws 401 when there is no iam session', async () => {
    getIamSessionMock.mockResolvedValue(null)
    const event = { context: { tenant: { schemaName: 'tenant_acme' } } } as any
    await expect(requireTenantSession(event)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('auto-creates a tenant user with role member on first login (no owner is seeded at provisioning time)', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    selectResult.mockResolvedValue([])
    insertResult.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const event = { context: { tenant: { schemaName: 'tenant_acme' } } } as any
    const result = await requireTenantSession(event)
    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
  })

  it('returns tenant + user when authenticated and a member', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    selectResult.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const event = { context: { tenant: { schemaName: 'tenant_acme' } } } as any
    const result = await requireTenantSession(event)
    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
  })
})
