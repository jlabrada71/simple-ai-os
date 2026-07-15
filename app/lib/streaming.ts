import type { ChatRequest } from '../../shared/types/chat'

export async function* streamingFetch(url: string, request: ChatRequest): AsyncGenerator<string>{
  try {
    // 1. Explicitly request 'stream' as the response type
    const response = await $fetch<ReadableStream>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      responseType: 'stream'
    })

    // 2. Obtain a reader from the ReadableStream instance
    const reader = response.getReader()
    const decoder = new TextDecoder()

    // 3. Incrementally read incoming chunks from the network pipeline
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Decode the binary Uint8Array chunk into readable text
      yield decoder.decode(value, { stream: true });   
    }
  } catch (error) {
    console.error('Streaming error:', error)
  } finally {
    
  }
}
