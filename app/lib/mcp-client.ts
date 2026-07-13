import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

let client: Client | null = null
let transport: StreamableHTTPClientTransport | null = null

export async function connectPromptsClient() {
  if (client) return client
  const url = new URL('/mcp', window.location.origin)
  transport = new StreamableHTTPClientTransport(url)
  client = new Client({ name: 'simple-ai-os-web', version: '1.0.0' })
  await client.connect(transport)
  return client
}

export async function listMcpPrompts() {
  const activeClient = await connectPromptsClient()
  const { prompts } = await activeClient.listPrompts()
  return prompts
}

export async function getMcpPrompt(name: string, args?: Record<string, string>) {
  const activeClient = await connectPromptsClient()
  return activeClient.getPrompt({ name, arguments: args })
}

export async function disconnectPromptsClient() {
  if (!client) return
  await client.close()
  client = null
  transport = null
}
