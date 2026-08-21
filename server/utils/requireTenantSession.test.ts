import { describe, expect, it, vi, beforeEach } from 'vitest'
import { users, tenantConfig } from '../db/schema/tenant'

const getIamSessionMock = vi.fn()
vi.stubGlobal('getIamSession', getIamSessionMock)

const usersSelectResult = vi.fn()
const tenantConfigSelectResult = vi.fn()
const apiKeySelectResult = vi.fn()
const insertReturning = vi.fn()
const updateWhereMock = vi.fn().mockResolvedValue(undefined)
const deleteWhereMock = vi.fn().mockResolvedValue(undefined)

vi.mock('../db/client', () => ({
  withTenantDb: async (_schema: string, fn: (db: unknown) => unknown) =>
    fn({
      select: (fields?: unknown) =>
        fields
          ? { from: () => ({ innerJoin: () => ({ where: () => ({ limit: apiKeySelectResult }) }) }) }
          : {
              from: (table: unknown) => ({
                where: () => ({
                  limit: table === tenantConfig ? tenantConfigSelectResult : usersSelectResult,
                }),
              }),
            },
      insert: () => ({ values: () => ({ returning: insertReturning }) }),
      update: () => ({ set: () => ({ where: updateWhereMock }) }),
      delete: () => ({ where: deleteWhereMock }),
    }),
}))

import { requireTenantSession } from './requireTenantSession'

function fakeEvent(tenant: unknown, headers: Record<string, string> = {}) {
  return { context: { tenant }, node: { req: { headers } } } as any
}

describe('requireTenantSession', () => {
  beforeEach(() => {
    getIamSessionMock.mockReset()
    usersSelectResult.mockReset()
    tenantConfigSelectResult.mockReset().mockResolvedValue([])
    apiKeySelectResult.mockReset()
    insertReturning.mockReset()
    updateWhereMock.mockClear()
    deleteWhereMock.mockClear()
  })

  it('throws 404 when no tenant was resolved', async () => {
    await expect(requireTenantSession(fakeEvent(null))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws 401 when there is no bearer token and no iam session', async () => {
    getIamSessionMock.mockResolvedValue(null)
    await expect(requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('auto-creates a tenant user with role member on first login (no pending admin)', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    usersSelectResult.mockResolvedValue([])
    tenantConfigSelectResult.mockResolvedValue([])
    insertReturning.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])

    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))

    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
    expect(result.via).toBe('session')
    expect(deleteWhereMock).not.toHaveBeenCalled()
  })

  it('creates the first login as admin when the email matches the pending admin marker, and clears it', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'Owner@Acme.com' })
    usersSelectResult.mockResolvedValue([])
    tenantConfigSelectResult.mockResolvedValue([{ value: { email: 'owner@acme.com' } }])
    insertReturning.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'Owner@Acme.com', role: 'admin' }])

    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))

    expect(result.user.role).toBe('admin')
    expect(deleteWhereMock).toHaveBeenCalled()
  })

  it('does not grant admin when the pending marker email does not match', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'someone-else@acme.com' })
    usersSelectResult.mockResolvedValue([])
    tenantConfigSelectResult.mockResolvedValue([{ value: { email: 'owner@acme.com' } }])
    insertReturning.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'someone-else@acme.com', role: 'member' }])

    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))

    expect(result.user.role).toBe('member')
    expect(deleteWhereMock).not.toHaveBeenCalled()
  })

  it('returns tenant + user when authenticated and a member (session path)', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    usersSelectResult.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))
    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
    expect(result.via).toBe('session')
  })

  it('resolves via a valid bearer API key without calling getIamSession', async () => {
    apiKeySelectResult.mockResolvedValue([{ apiKey: { id: 'k1' }, user: { id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' } }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }, { authorization: 'Bearer sao_validtoken' }))
    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
    expect(result.via).toBe('apiKey')
    expect(updateWhereMock).toHaveBeenCalled()
    expect(getIamSessionMock).not.toHaveBeenCalled()
  })

  it('falls through to the session check when the bearer token does not match any key', async () => {
    apiKeySelectResult.mockResolvedValue([])
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    usersSelectResult.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }, { authorization: 'Bearer sao_wrongtoken' }))
    expect(result.via).toBe('session')
  })
})
