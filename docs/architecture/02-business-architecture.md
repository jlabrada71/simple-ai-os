# 02 — Baseline Business Architecture

> **ADM phase.** Phase B (Business Architecture).
> Describes the *current* business architecture of the `simple-ai-os` application:
> actors, capabilities/functions, services, processes, and measures.

---

## 2.1 Organization / Actor catalog

| # | Actor | Description | Interaction with the system | Source |
|---|-------|-------------|------------------------------|--------|
| A1 | End user (developer / power user) | The product's target persona | Opens the landing page, chats with the assistant, manages prompts | `app/pages/index.vue`, `app/pages/chat*.vue`, `app/pages/prompts/*` |
| A2 | MCP client (e.g. Claude Desktop) | External tool consuming prompts over MCP | `prompts/list`, `prompts/get` over `POST /mcp` | `server/mcp/server.ts`, `app/lib/mcp-client.ts` |
| A3 | CLI operator | Runs a one-shot agent query from a terminal | `cli/agent.ts` | `cli/agent.ts` |
| A4 | Anthropic (Claude) | External LLM backing the chat + prompt-improver agents | Receives `messages.create` calls | `server/lib/agent*.ts`, `server/lib/prompt-improver.ts` |
| A5 | IAM (future SSO) | Central identity provider (specified, not wired) | Would authenticate end users | `docs/authentication.md` |

> The current app has **no authenticated user roles** — the "session" is an unauthenticated
> stub (`server/lib/session.ts` sets `userId: '123'`, `role: 'admin'`).

---

## 2.2 Role catalog

| # | Role | Applies to | Permissions / bounds | Source |
|---|------|-----------|----------------------|--------|
| R1 | Anonymous app user | A1 | Full access to chat and prompt CRUD (no auth gate) | `app/pages/*`, `server/api/*` |
| R2 | Stub "admin" user | A1 | Hardcoded `{ userId: '123', role: 'admin' }` in every session; not enforced anywhere | `server/lib/session.ts` |
| R3 | MCP consumer | A2 | Read-only access to prompts via MCP (list/get) | `server/mcp/server.ts` |
| R4 | CLI operator | A3 | Direct one-shot query via the orchestrator agent | `cli/agent.ts` |
| R5 | IAM-authenticated user | A5 | Planned per `docs/authentication.md`; not implemented | `docs/authentication.md` |

---

## 2.3 Business Service / Function catalog

| # | Capability / function | Description | Owner (component) | Source |
|---|----------------------|-------------|-------------------|--------|
| F1 | Marketing / landing | Present the product and entry points to chat & prompts | `app/pages/index.vue` |
| F2 | Chat — non-streaming | Ask the assistant; full response returned at once | `app/pages/chat.vue`, `server/api/agent.post.ts`, `server/lib/agent.ts` |
| F3 | Chat — streaming | Ask the assistant; tokens streamed as they arrive | `app/pages/chat-streaming.vue`, `server/api/agent-stream.post.ts`, `server/lib/agent-streaming.ts` |
| F4 | Stream reference | Minimal LLM-free streaming demo | `app/pages/stream-test.vue`, `server/api/stream-test.post.ts` |
| F5 | Prompt library (CRUD) | Create/list/get/update/delete reusable prompt templates | `app/pages/prompts/*`, `server/api/prompts/*`, `server/lib/prompts.ts` |
| F6 | Prompt version history | Snapshot every edit/delete; retrieve a prompt's history | `server/lib/prompts.ts` (`prompt_history`), `server/api/prompts/[id]/history.get.ts` |
| F7 | Prompt improvement | Rewrite a prompt's content via the prompt-improver agent | `server/api/prompts/improve.post.ts`, `server/lib/prompt-improver.ts` |
| F8 | Prompt version comparison UI | Diff a historical version against the live edit form | `app/pages/prompts/[id].vue`, `@donedeal0/superdiff` |
| F9 | MCP prompt exposure | Expose prompts over MCP (`prompts/list`, `prompts/get`) | `server/mcp/server.ts`, `server/routes/mcp.*` |
| F10 | Agent definition loading | Load agent system prompts from markdown files at runtime | `server/lib/agents.ts`, `server/agents/*` |
| F11 | Session / thread management | Mint a session ID; persist conversation history | `server/lib/session.ts`, `server/lib/agent*.ts` |
| F12 | CLI agent query | One-shot agent invocation from the command line | `cli/agent.ts` |

---

## 2.4 Location catalog

| # | Location | Purpose | Source |
|---|----------|---------|--------|
| L1 | Local dev (host) | `http://localhost:3000` app; Postgres `localhost:5433` | `docker-compose.yml`, `README.md` |
| L2 | Docker dev service | Hot-reload dev server in a container | `Dockerfile` (dev target), `docker-compose.yml` |
| L3 | Docker prod service | Built `.output` served by `node .output/server/index.mjs` | `Dockerfile` (prod target), `docker-compose.yml` |
| L4 | MCP endpoint | `POST /mcp` (in-process, no separate port) | `README.md`, `server/routes/mcp.post.ts` |

> No physical/geographic office or production hosting records are present in the repo.

---

## 2.5 Process / Event / Control / Product catalog

### Product / service offering (as marketed)

| # | Offering | Description | Source |
|---|----------|-------------|--------|
| PR1 | "Simple AI OS" | AI operating system for creating and improving AI prompts | `app/pages/index.vue` |
| PR2 | Chat Streaming | Real-time streaming chat with markdown rendering | `app/pages/index.vue` |
| PR3 | Prompt library | Version-controlled personal prompt library | `app/pages/index.vue`, `app/pages/prompts/*` |

### Key end-to-end processes (as implemented)

| # | Process | Trigger | Steps (high level) | Source |
|---|---------|---------|--------------------|--------|
| BP1 | Streaming chat turn | User submits message or prompt | Build `ChatRequest` → `POST /api/agent-stream` → ensure session → (prompt mode) resolve prompt via in-memory MCP → call Claude stream → forward text deltas → persist history | `app/pages/chat-streaming.vue`, `server/api/agent-stream.post.ts`, `server/lib/agent-streaming.ts` |
| BP2 | Non-streaming chat turn | User submits message | `POST /api/agent` → ensure session → `messages.create` → return full text → persist history | `app/pages/chat.vue`, `server/lib/agent.ts` |
| BP3 | Prompt creation | User submits the new-prompt form | Validate (zod) → insert → return 201 (409 on duplicate name) | `server/api/prompts/index.post.ts`, `server/lib/prompts.ts` |
| BP4 | Prompt update (versioned) | User edits a prompt | Validate → snapshot current row to `prompt_history` (`updated`) → update + increment `version` (transaction) | `server/lib/prompts.ts` `updatePrompt` |
| BP5 | Prompt deletion | User deletes from list | Delete row → snapshot to `prompt_history` (`deleted`) (transaction) | `server/lib/prompts.ts` `deletePrompt` |
| BP6 | Prompt improvement | User clicks "Improve" | `POST /api/prompts/improve` → prompt-improver agent → return rewritten content (not persisted until Save) | `server/api/prompts/improve.post.ts` |
| BP7 | MCP prompt list/get | MCP client connects | Build fresh MCP server from DB → `prompts/list`/`prompts/get` with `{{var}}` interpolation | `server/mcp/server.ts`, `server/lib/mcp-prompts.ts` |

### Events (recorded state changes)

| # | Event | Representation | Source |
|---|-------|----------------|--------|
| E1 | Prompt updated | `prompt_history` row with `action: 'updated'` | `server/lib/prompts.ts` |
| E2 | Prompt deleted | `prompt_history` row with `action: 'deleted'` | `server/lib/prompts.ts` |
| E3 | Prompt version bumped | `prompts.version` incremented on update | `server/lib/prompts.ts` |

### Controls

| # | Control | Purpose | Source |
|---|---------|---------|--------|
| C1 | Zod schema validation | Validate chat requests, prompt CRUD bodies, query params | `shared/types/chat.ts`, `server/lib/prompts.ts` |
| C2 | Unique-name enforcement | `409` on duplicate prompt `name` (unique violation `23505`) | `server/lib/prompts.ts`, `server/api/prompts/*` |
| C3 | Transactional history writes | Update/delete + history snapshot are atomic | `server/lib/prompts.ts` |
| C4 | Environment-based config | API keys/base URLs read from env, never hardcoded | `.env.example`, `nuxt.config.ts` |

---

## 2.6 Contract / Measure catalog

| # | Measure / agreement | Target (if known) | Mechanism | Source |
|---|---------------------|-------------------|-----------|--------|
| M1 | Prompt list page size | default 20, max 100 | `listPromptsQuerySchema` | `server/lib/prompts.ts` |
| M2 | Prompt name uniqueness | unique `name` | DB unique constraint + `23505` handling | `server/db/schema.ts` |
| M3 | Chat max tokens | 10 000 | `max_tokens` in `messages.create` | `server/lib/agent.ts`, `agent-streaming.ts` |
| M4 | Model | `claude-sonnet-5` (hardcoded) | `model` param | `server/lib/agent*.ts`, `prompt-improver.ts` |

> No formal SLAs/OLAs, retention policies, or regulatory obligations are documented.

---

## 2.7 Matrices

### Actor / Role matrix

| Actor | R1 Anon | R2 Stub admin | R3 MCP | R4 CLI | R5 IAM |
|-------|:--:|:--:|:--:|:--:|:--:|
| A1 End user | ● | (unused) | | | |
| A2 MCP client | | | ● | | |
| A3 CLI operator | | | | ● | |
| A4 Anthropic | | | | | |
| A5 IAM (future) | | | | | ● (planned) |

### Business Interaction matrix (function → actor)

| Function | A1 User | A2 MCP | A3 CLI | A4 Anthropic |
|----------|:--:|:--:|:--:|:--:|
| F1 Landing | ● | | | |
| F2 Chat (non-stream) | ● | | | ● (backing) |
| F3 Chat (stream) | ● | | | ● (backing) |
| F4 Stream reference | ● | | | |
| F5 Prompt CRUD | ● | | | |
| F6 Version history | ● | | | |
| F7 Prompt improvement | ● | | | ● (backing) |
| F8 Compare UI | ● | | | |
| F9 MCP exposure | | ● | | |
| F10 Agent loading | | | | |
| F11 Sessions | ● | | | |
| F12 CLI query | | | ● | ● (backing) |

---

## 2.8 Diagrams

### Functional decomposition (text)

```
Simple AI OS
├── Chat
│   ├── F2  Non-streaming chat
│   ├── F3  Streaming chat
│   ├── F4  Stream reference (LLM-free)
│   └── F11 Session / thread management
├── Prompt library
│   ├── F5  Prompt CRUD
│   ├── F6  Version history
│   ├── F7  Prompt improvement (agent)
│   └── F8  Version comparison UI
├── MCP
│   └── F9  MCP prompt exposure
├── Agents
│   └── F10 Agent definition loading (markdown)
└── Tooling
    ├── F12 CLI agent query
    └── F1  Marketing / landing
```

The request/streaming flows are described in detail in `CLAUDE.md` and diagrammed in
[`04-application-architecture.md`](./04-application-architecture.md) §4.5.
