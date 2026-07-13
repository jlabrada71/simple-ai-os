import { ZodError } from 'zod'
import { createPrompt, isUniqueViolation } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  try {
    const prompt = await createPrompt(body)
    setResponseStatus(event, 201)
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
