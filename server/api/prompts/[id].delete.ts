import { deletePrompt } from '../../lib/prompts'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const prompt = await deletePrompt(id)
  if (!prompt) {
    throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })
  }
  return prompt
})
