import { describe, expect, it } from 'vitest'
import { prompts, promptHistory, users, tenantConfig } from './tenant'

describe('tenant schema', () => {
  it('exports the tenant-scoped tables', () => {
    expect(prompts).toBeDefined()
    expect(promptHistory).toBeDefined()
    expect(users).toBeDefined()
    expect(tenantConfig).toBeDefined()
  })
})
