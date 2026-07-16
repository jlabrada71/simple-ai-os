import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Agent = { systemPrompt: string }

export function loadAgents(agentsDir: string): Record<string, Agent> {
  const agents: Record<string, Agent> = {}
  const entries = readdirSync(agentsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const systemPrompt = readFileSync(join(agentsDir, entry.name, 'agent.md'), 'utf-8').trim()
    agents[entry.name] = { systemPrompt }
  }

  return agents
}

export function getAgent(agents: Record<string, Agent>, name: string): Agent {
  const agent = agents[name]
  if (!agent) {
    throw new Error(`Unknown agent: ${name}`)
  }
  return agent
}

const agentsDir = join(process.cwd(), 'server', 'agents')

export const agents = loadAgents(agentsDir)
