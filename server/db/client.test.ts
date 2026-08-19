import { describe, expect, it } from 'vitest'
import { getTenantDb } from './client'

describe('getTenantDb', () => {
  it('returns the same cached client for the same schema name', () => {
    const a = getTenantDb('tenant_acme')
    const b = getTenantDb('tenant_acme')
    expect(a).toBe(b)
  })

  it('returns a different client for a different schema name', () => {
    const a = getTenantDb('tenant_acme')
    const b = getTenantDb('tenant_other')
    expect(a).not.toBe(b)
  })
})
