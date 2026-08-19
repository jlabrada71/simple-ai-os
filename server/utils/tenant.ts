import { eq } from 'drizzle-orm'
import { getHeader, createError } from 'h3'
import type { H3Event } from 'h3'
import { publicDb } from '../db/client'
import { tenants } from '../db/schema/public'

export interface TenantContext {
  id: string
  slug: string
  schemaName: string
  companyName: string
}

const tenantCache = new Map<string, TenantContext>()

const APEX_HOSTNAMES = new Set([
  'simple-ai-os.tryyourideas.com',
  'localhost',
])

const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

function extractSlug(host: string | undefined): string | null {
  if (!host) return null

  const hostname = host.split(':')[0]
  if (APEX_HOSTNAMES.has(hostname)) return null

  // IP addresses (e.g. 127.0.0.1, used by local dev servers and test
  // runners like @nuxt/test-utils) are never tenant subdomains - without
  // this check "127" would be parsed as a slug and fail tenant lookup.
  if (IPV4_REGEX.test(hostname)) return null

  const parts = hostname.split('.')
  if (parts.length < 2) return null

  return parts[0]
}

/**
 * Resolves the tenant for the current request from the Host header.
 * Returns null for the apex site (no subdomain) - callers that require a
 * tenant (login, chat, prompts, mcp) reject when this is null.
 */
export async function resolveTenant(event: H3Event): Promise<TenantContext | null> {
  const slug = extractSlug(getHeader(event, 'host'))
  if (!slug) return null

  const cached = tenantCache.get(slug)
  if (cached) return cached

  const [row] = await publicDb.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Unknown tenant' })
  }

  const context: TenantContext = {
    id: row.id,
    slug: row.slug,
    schemaName: row.schemaName,
    companyName: row.companyName,
  }
  tenantCache.set(slug, context)
  return context
}
