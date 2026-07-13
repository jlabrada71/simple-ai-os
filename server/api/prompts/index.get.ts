import { ZodError } from 'zod'
import { listPrompts } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  try {
    return await listPrompts(query)
  } catch (err) {
    if (err instanceof ZodError) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid query parameters', data: err.issues })
    }
    throw err
  }
})
