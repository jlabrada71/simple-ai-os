import { describe, expect, it, vi, beforeEach } from 'vitest'

const getIamSessionMock = vi.fn()
vi.stubGlobal('getIamSession', getIamSessionMock)

const selectResult = vi.fn()
const apiKeySelectResult = vi.fn()
const insertReturning = vi.fn()
const updateWhereMock = vi.fn().mockResolvedValue(undefined)

vi.mock('../db/client', () => ({
  withTenantDb: async (_schema: string, fn: (db: unknown) => unknown) =>
    fn({
      select: (fields?: unknown) =>
        fields
          ? { from: () => ({ innerJoin: () => ({ where: () => ({ limit: apiKeySelectResult }) }) }) }
          : { from: () => ({ where: () => ({ limit: selectResult }) }) },
      insert: () => ({ values: () => ({ returning: insertReturning }) }),
      update: () => ({ set: () => ({ where: updateWhereMock }) }),
    }),
}))

import { requireTenantSession } from './requireTenantSession'

function fakeEvent(tenant: unknown, headers: Record<string, string> = {}) {
  return { context: { tenant }, node: { req: { headers } } } as any
}

describe('requireTenantSession', () => {
  beforeEach(() => {
    getIamSessionMock.mockReset()
    selectResult.mockReset()
    apiKeySelectResult.mockReset()
    insertReturning.mockReset()
    updateWhereMock.mockClear()
  })

  it('throws 404 when no tenant was resolved', async () => {
    await expect(requireTenantSession(fakeEvent(null))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws 401 when there is no bearer token and no iam session', async () => {
    getIamSessionMock.mockResolvedValue(null)
    await expect(requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('auto-creates a tenant user with role member on first login (session path)', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    selectResult.mockResolvedValue([])
    insertReturning.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }))
    expect(result.user).toEqual({ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' })
    expect(result.via).toBe('session')
  })

  it('returns tenant + user when authenticated and a member (session path)', async () => {
    getIamSessionMock.mockResolvedValue({ username: 'sub-1', email: 'a@b.com' })
    selectResult.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
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
    selectResult.mockResolvedValue([{ id: 'u1', iamSub: 'sub-1', email: 'a@b.com', role: 'member' }])
    const result = await requireTenantSession(fakeEvent({ schemaName: 'tenant_acme' }, { authorization: 'Bearer sao_wrongtoken' }))
    expect(result.via).toBe('session')
  })
})
