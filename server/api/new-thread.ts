import { initSession } from '../lib/session'

export default defineEventHandler(async (event) => {
  await initSession(event);
  return { success: true }
})


