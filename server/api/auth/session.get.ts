import { requireTenantSession } from '../../utils/requireTenantSession'

export default defineEventHandler(async (event) => {
  try {
    const { user } = await requireTenantSession(event)
    return { authenticated: true, user: { id: user.id, email: user.email, role: user.role } }
  } catch {
    return { authenticated: false, user: null }
  }
})
