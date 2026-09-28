import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer } from '../mcp/server'
import { withTenantDb } from '../db/client'
import { requireTenantSession } from '../utils/requireTenantSession'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantSession(event)

  const body = await readBody(event)
  const server = await withTenantDb(tenant.schemaName, (db) => createMcpServer(db))
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  event.node.res.on('close', () => {
    transport.close()
    server.close()
  })

  await server.connect(transport)
  await transport.handleRequest(event.node.req, event.node.res, body)
})
