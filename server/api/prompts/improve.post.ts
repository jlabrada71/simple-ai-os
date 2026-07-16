import { ZodError } from 'zod'
import { improvePrompt } from '../../lib/prompt-improver'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  try {
    return await improvePrompt(body)
  } catch (err) {
    if (err instanceof ZodError) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid prompt body', data: err.issues })
    }
    throw err
  }
})
