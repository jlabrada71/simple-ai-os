import { describe, expect, it, vi } from 'vitest'

const { insertMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
}))

vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: vi.fn(() => ({})) }))
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(function () {
    return {
      query: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
    }
  }),
}))
vi.mock('drizzle-orm/node-postgres/migrator', () => ({ migrate: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../utils/tenantIamRegistration', () => ({
  registerTenantIamApp: vi.fn().mockResolvedValue({
    appId: 'app-1',
    clientSecret: 'secret',
    authenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/authenticated',
    notAuthenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/not-authenticated',
  }),
}))
vi.mock('../utils/tenantIamConfig', () => ({
  getTenantIamAppConfig: vi.fn().mockResolvedValue(null),
  storeTenantIamAppConfig: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../utils/pendingAdminEmail', () => ({
  setPendingAdminEmail: vi.fn().mockResolvedValue(undefined),
}))

describe('provisionTenant', () => {
  it('returns alreadyExisted: true without inserting again when the slug is already provisioned', async () => {
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: '1', slug: 'acme', schemaName: 'tenant_acme', companyName: 'Acme' }] }) }) }),
      insert: insertMock,
    }
    const { drizzle } = await import('drizzle-orm/node-postgres')
    ;(drizzle as any).mockReturnValue(fakeDb)

    const { provisionTenant } = await import('./provisionTenant')
    const result = await provisionTenant({ slug: 'acme', name: 'Acme Co' })

    expect(result).toEqual({ schemaName: 'tenant_acme', alreadyExisted: true })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('stores a pending admin email when provisioning a brand-new tenant with an owner email', async () => {
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    }
    const { drizzle } = await import('drizzle-orm/node-postgres')
    ;(drizzle as any).mockReturnValue(fakeDb)

    const { provisionTenant } = await import('./provisionTenant')
    const { setPendingAdminEmail } = await import('../utils/pendingAdminEmail')

    await provisionTenant({ slug: 'acme2', name: 'Acme Two', ownerEmail: 'Owner@Acme.com' })

    expect(setPendingAdminEmail).toHaveBeenCalledWith(fakeDb, 'Owner@Acme.com')
  })

  it('does not touch pending admin email when ownerEmail is omitted', async () => {
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    }
    const { drizzle } = await import('drizzle-orm/node-postgres')
    ;(drizzle as any).mockReturnValue(fakeDb)

    const { provisionTenant } = await import('./provisionTenant')
    const { setPendingAdminEmail } = await import('../utils/pendingAdminEmail')
    ;(setPendingAdminEmail as any).mockClear()

    await provisionTenant({ slug: 'acme3', name: 'Acme Three' })

    expect(setPendingAdminEmail).not.toHaveBeenCalled()
  })
})
