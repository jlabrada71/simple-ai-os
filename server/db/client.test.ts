import { describe, expect, it } from 'vitest'
import { getTenantDb } from './client'

describe('getTenantDb', () => {
  it('returns the same cached client for the same schema name', () => {
    const a = getTenantDb('tenant_acme')
    const b = getTenantDb('tenant_acme')
    expect(a).toBe(b)
  })

  it('returns a different client for a different schema name', () => {
    const a = getTenantDb('tenant_acme2')
    const b = getTenantDb('tenant_other2')
    expect(a).not.toBe(b)
  })

  it('evicts the least-recently-used pool once the cache exceeds 20 entries', () => {
    const first = getTenantDb('tenant_lru_0')
    for (let i = 1; i < 20; i++) {
      getTenantDb(`tenant_lru_${i}`)
    }
    // Cache is now full (20 entries: tenant_lru_0..19). One more distinct
    // schema must evict tenant_lru_0, the least-recently-used.
    getTenantDb('tenant_lru_20')

    const firstAgain = getTenantDb('tenant_lru_0')
    expect(firstAgain).not.toBe(first)
  })

  it('touching an entry protects it from eviction', () => {
    const protectedClient = getTenantDb('tenant_protected')
    for (let i = 0; i < 19; i++) {
      getTenantDb(`tenant_fill_${i}`)
    }
    // Cache is now full (20 entries: tenant_protected + tenant_fill_0..18).
    // Re-touch tenant_protected so it's no longer the least-recently-used.
    getTenantDb('tenant_protected')
    // One more distinct schema should evict tenant_fill_0 (now
    // least-recently-used), not tenant_protected.
    getTenantDb('tenant_new_after_touch')

    const protectedAgain = getTenantDb('tenant_protected')
    expect(protectedAgain).toBe(protectedClient)
  })
})
