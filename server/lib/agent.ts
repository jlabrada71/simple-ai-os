import { Anthropic } from "@anthropic-ai/sdk";
import { ContentBlock } from "@anthropic-ai/sdk/resources";

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

export async function chat(sessionId: string, userMessage: string): Promise<string> {
    const storage = useStorage('session'); // targets the 'session' mount

    const sessionData = await storage.getItem(sessionId) as { messages: Message[]; claudeResponse: Anthropic.Message[] } || { messages: [] as Message[], claudeResponse: [] as Anthropic.Message[] };
    const { messages, claudeResponse = [] } = sessionData;
    // Set data 
    
    addUserMessage(messages, userMessage);

    const responseMessage = await client.messages.create({
        max_tokens: 1024,
        messages: messages,
        model: "claude-sonnet-5",
        system: systemPrompt
    });
    const { content } = responseMessage;
    claudeResponse.push(responseMessage);


    addAssistantMessage(messages, content);

    sessionData.messages = messages;
    sessionData.claudeResponse = claudeResponse;
    await storage.setItem(sessionId, sessionData);

    const response = responseMessage.content.map(block => {
        if (block.type === "text") {
            return block.text;
        }
        return '';
    }).join('\n');   
    return response;

}