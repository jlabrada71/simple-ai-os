import { describe, expect, it, beforeEach } from 'vitest'
import { requireAdminApiKey } from './adminApiAuth'

function eventWithHeader(value: string | undefined) {
  return { node: { req: { headers: { 'x-admin-api-key': value } } } } as any
}

describe('requireAdminApiKey', () => {
  beforeEach(() => {
    process.env.NUXT_ADMIN_API_KEY = 'correct-key'
  })

  it('throws 503 when the key is not configured', () => {
    delete process.env.NUXT_ADMIN_API_KEY
    expect(() => requireAdminApiKey(eventWithHeader('anything'))).toThrow()
  })

  it('throws 401 when no key is provided', () => {
    expect(() => requireAdminApiKey(eventWithHeader(undefined))).toThrow()
  })

  it('throws 401 when the wrong key is provided', () => {
    expect(() => requireAdminApiKey(eventWithHeader('wrong-key'))).toThrow()
  })

  it('does not throw when the correct key is provided', () => {
    expect(() => requireAdminApiKey(eventWithHeader('correct-key'))).not.toThrow()
  })
})
