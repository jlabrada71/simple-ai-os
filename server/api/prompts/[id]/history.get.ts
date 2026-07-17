import { listPromptHistory } from '../../../lib/prompts'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const history = await listPromptHistory(id)
  return { history }
})
