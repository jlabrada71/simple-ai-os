import { createError, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { hashMatches, sha256Hex } from './hash'

export function requireAdminApiKey(event: H3Event): void {
  const configuredKey = process.env.NUXT_ADMIN_API_KEY
  if (!configuredKey) {
    throw createError({ statusCode: 503, statusMessage: 'Admin API key is not configured.' })
  }

  const providedKey = getHeader(event, 'x-admin-api-key')
  if (!providedKey || !hashMatches(providedKey, sha256Hex(configuredKey))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or missing admin API key.' })
  }
}
