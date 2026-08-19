import { describe, expect, it, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'

beforeAll(() => {
  process.env.NUXT_TENANT_SECRET_ENCRYPTION_KEY = randomBytes(32).toString('hex')
})

import { storeTenantIamAppConfig, getTenantIamAppConfig } from './tenantIamConfig'

function fakeDb() {
  let stored: { key: string; value: unknown } | null = null
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (stored ? [stored] : []),
        }),
      }),
    }),
    insert: () => ({
      values: (row: { key: string; value: unknown }) => {
        stored = row
        return {
          onConflictDoUpdate: async ({ set }: { set: { value: unknown } }) => {
            stored = { key: row.key, value: set.value }
          },
        }
      },
    }),
  }
}

describe('tenantIamConfig', () => {
  it('round-trips an app config for a given applicationName, encrypting the client secret at rest', async () => {
    const db = fakeDb() as any
    await storeTenantIamAppConfig(db, 'simple-ai-os', {
      appId: 'app-1',
      clientSecret: 'top-secret',
      authenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/authenticated',
      notAuthenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/not-authenticated',
    })

    const config = await getTenantIamAppConfig(db, 'simple-ai-os')
    expect(config).toEqual({
      appId: 'app-1',
      clientSecret: 'top-secret',
      authenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/authenticated',
      notAuthenticatedUrl: 'https://acme.simple-ai-os.tryyourideas.com/not-authenticated',
    })
  })

  it('returns null for an unregistered applicationName', async () => {
    const db = fakeDb() as any
    expect(await getTenantIamAppConfig(db, 'simple-ai-os')).toBeNull()
  })
})
