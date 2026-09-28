import { Anthropic } from "@anthropic-ai/sdk";
import type { drizzle } from "drizzle-orm/node-postgres";
import { agents, getAgent } from './agents';
import { getThreadMessages, recordExchange } from './threads';

const systemAgent = getAgent(agents, 'orchestrator');

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"]
});

type Message = { role: "user" | "assistant"; content: string };

export async function chat(db: ReturnType<typeof drizzle>, threadId: string, userMessage: string): Promise<string> {
    const history = await getThreadMessages(db, threadId)
    const messages: Message[] = history.map((m) => ({ role: m.role, content: m.content }))
    messages.push({ role: "user", content: userMessage })

    const responseMessage = await client.messages.create({
        max_tokens: 10000,
        messages,
        model: "claude-sonnet-5",
        system: systemAgent.systemPrompt
    });

    const responseText = responseMessage.content.map(block => {
        if (block.type === "text") {
            return block.text;
        }
        return '';
    }).join('\n');

    await recordExchange(db, threadId, userMessage, responseText)

    return responseText;
}
