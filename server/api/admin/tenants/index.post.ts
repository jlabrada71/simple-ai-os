import { requireAdminApiKey } from '../../../utils/adminApiAuth'
import { provisionTenant } from '../../../lib/provisionTenant'

interface ProvisionRequestBody {
  slug?: string
  name?: string
}

const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export default defineEventHandler(async (event) => {
  requireAdminApiKey(event)

  const body = await readBody<ProvisionRequestBody>(event)
  const { slug, name } = body ?? {}

  if (!slug || !name) {
    throw createError({ statusCode: 400, statusMessage: 'slug and name are required' })
  }
  if (!SLUG_REGEX.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Slug must be lowercase letters, numbers, and hyphens only' })
  }

  const result = await provisionTenant({ slug, name })

  return { success: true, slug, schemaName: result.schemaName, alreadyExisted: result.alreadyExisted }
})
