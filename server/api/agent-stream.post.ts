import { chat } from '../lib/agent-streaming';
import { initSession } from '../lib/session';

export default defineEventHandler(async (event) => {
    const body = await readBody(event)    

    const sessionId = getCookie(event, 'session_id') || (await initSession(event)).sessionId;
    console.log(`Session ID: ${sessionId}`);
    if (!sessionId) {
        return { error: 'No valid session found' }
    }

    const stream = chat(sessionId, body.message);    


    return sendStream(event, stream);
})