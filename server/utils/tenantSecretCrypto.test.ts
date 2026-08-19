import { describe, expect, it, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'

beforeAll(() => {
  process.env.NUXT_TENANT_SECRET_ENCRYPTION_KEY = randomBytes(32).toString('hex')
})

import { encryptSecret, decryptSecret } from './tenantSecretCrypto'

describe('tenantSecretCrypto', () => {
  it('round-trips a plaintext value', () => {
    const encrypted = encryptSecret('super-secret-value')
    expect(encrypted).not.toBe('super-secret-value')
    expect(decryptSecret(encrypted)).toBe('super-secret-value')
  })
})
