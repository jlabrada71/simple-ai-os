import { Anthropic } from "@anthropic-ai/sdk";
import { type ContentBlock } from "@anthropic-ai/sdk/resources";
import { agents, getAgent } from '../server/lib/agents.ts';

const systemAgent = getAgent(agents, 'orchestrator');

const client = new Anthropic({
    baseURL: process.env['AGENT_BASE_URL'],
    apiKey: "another key"
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

export async function chat(userMessage: string): Promise<string> {
   
    const messages: Message[] = [];
    const claudeResponse = [];   
    
    addUserMessage(messages, userMessage);

    const responseMessage = await client.messages.create({
        max_tokens: 10000,
        messages: messages,
        model: "claude-sonnet-5",
        system: systemAgent.systemPrompt
    });
    const { content } = responseMessage;
    claudeResponse.push(responseMessage);


    addAssistantMessage(messages, content);
   
    const response = responseMessage.content.map(block => {
        if (block.type === "text") {
            return block.text;
        }
        return '';
    }).join('\n');   
    return response;
}


console.log( await chat('what is the world population?'))


