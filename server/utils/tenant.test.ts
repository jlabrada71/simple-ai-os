import { describe, expect, it, vi, beforeEach } from 'vitest'

const selectMock = vi.fn()
vi.mock('../db/client', () => ({
  publicDb: { select: () => ({ from: () => ({ where: () => ({ limit: selectMock }) }) }) },
}))

import { resolveTenant } from './tenant'
import type { H3Event } from 'h3'

function eventWithHost(host: string | undefined): H3Event {
  return { node: { req: { headers: { host } } } } as unknown as H3Event
}

describe('resolveTenant', () => {
  beforeEach(() => {
    selectMock.mockReset()
  })

  it('returns null for the apex hostname', async () => {
    expect(await resolveTenant(eventWithHost('simple-ai-os.tryyourideas.com'))).toBeNull()
  })

  it('returns null for localhost', async () => {
    expect(await resolveTenant(eventWithHost('localhost:3000'))).toBeNull()
  })

  it('returns null for a bare IPv4 host', async () => {
    expect(await resolveTenant(eventWithHost('127.0.0.1:3000'))).toBeNull()
  })

  it('returns null when the host header is missing', async () => {
    expect(await resolveTenant(eventWithHost(undefined))).toBeNull()
  })

  it('404s on an unknown tenant slug', async () => {
    selectMock.mockResolvedValue([])
    await expect(resolveTenant(eventWithHost('unknown.simple-ai-os.tryyourideas.com'))).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('resolves a known tenant slug', async () => {
    selectMock.mockResolvedValue([{ id: '1', slug: 'acme', schemaName: 'tenant_acme', companyName: 'Acme' }])
    const ctx = await resolveTenant(eventWithHost('acme.simple-ai-os.tryyourideas.com'))
    expect(ctx).toEqual({ id: '1', slug: 'acme', schemaName: 'tenant_acme', companyName: 'Acme' })
  })
})
