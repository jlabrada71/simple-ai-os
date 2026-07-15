import { Anthropic } from "@anthropic-ai/sdk";
import { ContentBlock } from "@anthropic-ai/sdk/resources";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../mcp/server";
import { type ChatRequest } from "../../shared/types/chat";

const systemPrompt = `You are a patient math tutor.
   Do not directly answer the student's questions. 
   Guide the student to a solution step by step.
`;

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"] // This is the default and can be omitted
});



type Message = { 
        role: "user" | "assistant" | "system"; 
        content: string| ContentBlock[] 
    };

function addUserMessage(messages: Message[], content: string) {
    messages.push({ role: "user", content });
}

function addAssistantMessage(messages: Message[], content: string| ContentBlock[]) {
    messages.push({ role: "assistant", content });
}

async function resolvePromptText(name: string, parameters?: Record<string, string>): Promise<string> {
    const server = await createMcpServer();
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "agent-streaming", version: "1.0.0" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.getPrompt({ name, arguments: parameters });
    const [firstMessage] = result.messages;
    if (!firstMessage) {
        throw new Error(`Prompt "${name}" returned no messages`);
    }
    const text = (firstMessage.content as { type: "text"; text: string }).text;

    await client.close();
    await server.close();

    return text;
}

export function chat(sessionId: string, request: ChatRequest): ReadableStream<string> {

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            let content = '';

            const storage = useStorage('session'); // targets the 'session' mount

            const sessionData = await storage.getItem(sessionId) as { messages: Message[]; claudeResponse: Anthropic.Message[] } || { messages: [] as Message[], claudeResponse: [] as Anthropic.Message[] };
            const { messages, claudeResponse = [] } = sessionData;
            // Set data

            const userMessageText = request.type === "text"
                ? request.text
                : await resolvePromptText(request.name, request.parameters);

            addUserMessage(messages, userMessageText);

            const claudeStream = await client.messages.create({
                max_tokens: 1024,
                messages: messages,
                model: "claude-sonnet-5",
                system: systemPrompt,
                stream: true,
            });
            for await (const messageStreamEvent of claudeStream) {
                console.log(`=============================================`);
                console.log(messageStreamEvent.type);
                // console.log(JSON.stringify(messageStreamEvent, null, 2));
                if(messageStreamEvent.type === "content_block_delta") {
                    if(messageStreamEvent.delta.type === "text_delta") {
                        const textChunk = messageStreamEvent.delta.text;
                        content += textChunk;
                        console.log(`Received text chunk: ${textChunk}`);
                        const encodedChunk = encoder.encode(textChunk);
                        controller.enqueue(encodedChunk);
                    }
                }

                // push the text content to the stream if it's a text block
            }
            // If you need to cancel a stream, you can break from the loop 
            // or call stream.controller.abort()

            // collect the claude response to push to 
            // claudeResponse.push(responseMessage);

            // collect the assistant message to push to messages
            addAssistantMessage(messages, content);

            sessionData.messages = messages;
            sessionData.claudeResponse = claudeResponse;
            await storage.setItem(sessionId, sessionData);

            console.log(`+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++`);
        
            controller.close();
        }
    });
    console.log('Returning the ReadableStream from chat function');
    return stream;

}