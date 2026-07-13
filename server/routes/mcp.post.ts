import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from '../mcp/server'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const server = await createMcpServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  event.node.res.on('close', () => {
    transport.close()
    server.close()
  })

  await server.connect(transport)
  await transport.handleRequest(event.node.req, event.node.res, body)
})
