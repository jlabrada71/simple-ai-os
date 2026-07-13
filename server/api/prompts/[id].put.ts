import { ZodError } from 'zod'
import { isUniqueViolation, updatePrompt } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  try {
    const prompt = await updatePrompt(id, body)
    if (!prompt) {
      throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })
    }
    return prompt
  } catch (err) {
    if (err instanceof ZodError) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid prompt body', data: err.issues })
    }
    if (isUniqueViolation(err)) {
      throw createError({ statusCode: 409, statusMessage: 'A prompt with this name already exists' })
    }
    throw err
  }
})
