# Features

- **Chat (non-streaming and streaming)**: two parallel implementations of a Claude-backed chat
  UI — `POST /api/agent` (full response) and `POST /api/agent-stream` (token-by-token via a
  `ReadableStream`). Both render assistant responses as markdown.
- **Conversation threads**: chat history is DB-backed and per-user, not tied to a browser
  cookie — it survives across devices/sessions. `chat-streaming.vue` has a thread list sidebar
  (multiple conversations, switchable, auto-titled from the first message); `chat.vue` always
  continues your most recent thread.
- **Personal API keys**: any tenant-scoped REST endpoint can be called with
  `Authorization: Bearer <token>` instead of a browser session, for scripts/integrations — see
  `docs/user-guides/config.md`.
- **Prompt library**: create, edit, delete, and version-compare reusable prompts, exposed to
  the chat UI's prompt picker and over MCP.
- **MCP server**: `/mcp` exposes the tenant's prompt library as MCP prompts for external MCP
  clients.
- **Multitenancy**: each customer ("tenant") gets an isolated Postgres schema
  (`tenant_<slug>`) — prompts, prompt history, and users are all tenant-scoped. Tenants are
  resolved by subdomain (`{slug}.simple-ai-os.tryyourideas.com`, or `{slug}.localhost:3000` in
  dev). A tenant provisioned in `web/home`'s admin gets a matching space here automatically,
  with no separate manual step (`POST /api/admin/tenants`, key-authenticated — see
  `docs/user-guides/config.md`).
- **SSO login via iam**: authentication is delegated to the centralized `iam` service
  (passwordless email-code login, authorization-code redirect flow). A user already logged
  into another `iam`-backed app (e.g. `home`) is signed into simple-ai-os automatically, with
  no extra login step, since `iam` reuses its existing browser session across apps.
