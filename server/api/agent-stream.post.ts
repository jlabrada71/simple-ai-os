import { chat } from '../lib/agent-streaming';
import { initSession } from '../lib/session';
import { chatRequestSchema } from '../../shared/types/chat';

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const request = chatRequestSchema.parse(body)

    const sessionId = getCookie(event, 'session_id') || (await initSession(event)).sessionId;
    console.log(`Session ID: ${sessionId}`);
    if (!sessionId) {
        return { error: 'No valid session found' }
    }

    const stream = chat(sessionId, request);


    return sendStream(event, stream);
})