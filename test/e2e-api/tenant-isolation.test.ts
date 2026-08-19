import { describe, expect, it, beforeAll } from 'vitest'
import { ensureTestTenant, getTestTenantDb } from '../helpers/db'
import { createPrompt, listPrompts } from '../../server/lib/prompts'

describe('tenant isolation', () => {
  let dbA: ReturnType<typeof getTestTenantDb>
  let dbB: ReturnType<typeof getTestTenantDb>

  beforeAll(async () => {
    const schemaA = await ensureTestTenant('e2e-tenant-a', 'Tenant A')
    const schemaB = await ensureTestTenant('e2e-tenant-b', 'Tenant B')
    dbA = getTestTenantDb(schemaA)
    dbB = getTestTenantDb(schemaB)
  })

  it('lets two tenants use the same prompt name with no collision', async () => {
    await createPrompt(dbA, { name: 'shared-name', content: 'from A' })
    await createPrompt(dbB, { name: 'shared-name', content: 'from B' })

    const { prompts: promptsA } = await listPrompts(dbA, {})
    const { prompts: promptsB } = await listPrompts(dbB, {})

    expect(promptsA.map((p) => p.content)).toContain('from A')
    expect(promptsA.map((p) => p.content)).not.toContain('from B')
    expect(promptsB.map((p) => p.content)).toContain('from B')
    expect(promptsB.map((p) => p.content)).not.toContain('from A')
  })
})
