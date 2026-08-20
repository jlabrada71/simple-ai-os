import { Anthropic } from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { drizzle } from "drizzle-orm/node-postgres";
import { createMcpServer } from "../mcp/server";
import { type ChatRequest } from "../../shared/types/chat";
import { agents, getAgent } from './agents';
import { getThreadMessages, recordExchange } from './threads';

const systemAgent = getAgent(agents, 'orchestrator');

const client = new Anthropic({
    baseURL: process.env['AGENT_BASE_URL'],
    apiKey: process.env["ANTHROPIC_API_KEY"]
});

type Message = { role: "user" | "assistant"; content: string };

async function resolvePromptText(db: ReturnType<typeof drizzle>, name: string, parameters?: Record<string, string>): Promise<string> {
    const server = await createMcpServer(db);
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

export function chat(db: ReturnType<typeof drizzle>, threadId: string, request: ChatRequest): ReadableStream<string> {
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            let content = '';

            const history = await getThreadMessages(db, threadId)
            const messages: Message[] = history.map((m) => ({ role: m.role, content: m.content }))

            const userMessageText = request.type === "text"
                ? request.text
                : await resolvePromptText(db, request.name, request.parameters);

            messages.push({ role: "user", content: userMessageText })

            const claudeStream = await client.messages.create({
                max_tokens: 10000,
                messages,
                model: "claude-sonnet-5",
                system: systemAgent.systemPrompt,
                stream: true,
            });
            for await (const messageStreamEvent of claudeStream) {
                if (messageStreamEvent.type === "content_block_delta") {
                    if (messageStreamEvent.delta.type === "text_delta") {
                        const textChunk = messageStreamEvent.delta.text;
                        content += textChunk;
                        controller.enqueue(encoder.encode(textChunk));
                    }
                }
            }

            await recordExchange(db, threadId, userMessageText, content)

            controller.close();
        }
    });
    return stream;
}
