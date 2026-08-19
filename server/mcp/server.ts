import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { drizzle } from 'drizzle-orm/node-postgres'
import { z } from 'zod'
import { listPrompts } from '../lib/prompts'
import { interpolate } from '../lib/mcp-prompts'

export async function createMcpServer(db: ReturnType<typeof drizzle>) {
  const server = new McpServer({ name: 'simple-ai-os-prompts', version: '1.0.0' })

  const { prompts: rows } = await listPrompts(db, { limit: 100 })

  for (const row of rows) {
    const argsSchema = Object.fromEntries(row.variables.map((name) => [name, z.string().optional()]))

    server.registerPrompt(
      row.name,
      { description: row.description ?? undefined, argsSchema },
      async (args) => ({
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: interpolate(row.content, args as Record<string, string | undefined>),
            },
          },
        ],
      }),
    )
  }

  return server
}
