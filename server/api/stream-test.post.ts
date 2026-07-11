export default defineEventHandler(async (event) => {

  const body = await readBody(event)    
  console.log(`Received request body: ${JSON.stringify(body.message)}`)
  
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      // Simulate chunk-by-chunk data transmissions (e.g., LLM tokens)
      const messages = ['Hello ', 'from ', 'a ', 'Nuxt ', 'streaming ', 'response!']
      
      for (const text of messages) {
        controller.enqueue(encoder.encode(text))
        // Delay each chunk by 300ms to visualize the stream
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
      
      controller.close()
    }
  })

  // Return the stream correctly via Nitro's utility
  return sendStream(event, stream)
})