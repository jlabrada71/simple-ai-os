export default defineEventHandler((event) => {
  setResponseStatus(event, 405)
  return {
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  }
})
