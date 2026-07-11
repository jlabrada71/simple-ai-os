import { H3Event } from "h3";

function generateRandomId(): string {
    return crypto.randomUUID();
}

export async function initSession(event: H3Event<globalThis.EventHandlerRequest>) {
  const sessionId = generateRandomId();
  const sessionData = { userId: '123', role: 'admin' };
 
  const storage = useStorage('assets:sessions');
  await storage.setItem(sessionId, sessionData);

  setCookie(event, 'session_id', sessionId, { httpOnly: true });
  console.log(`Session initialized with ID: ${sessionId}`);
  return { sessionId }
}