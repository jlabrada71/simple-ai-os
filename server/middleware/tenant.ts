import { resolveTenant } from '../utils/tenant'

declare module 'h3' {
  interface H3EventContext {
    tenant: Awaited<ReturnType<typeof resolveTenant>>
  }
}

export default defineEventHandler(async (event) => {
  event.context.tenant = await resolveTenant(event)
})
