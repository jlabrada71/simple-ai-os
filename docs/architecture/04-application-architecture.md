# 04 — Baseline Application Architecture

> **ADM phase.** Phase C (Information Systems Architectures — Application).
> Describes the *current* application landscape: the `simple-ai-os` application, its
> internal modules, interfaces, and integrations.

---

## 4.1 Application Portfolio catalog

| # | Application / module | Type | Business function | Owner (code path) | Status |
|---|----------------------|------|-------------------|-------------------|--------|
| AP1 | `simple-ai-os` frontend | Web app (Vue 3 SSR/CSR) | Landing page, chat UIs, prompt management | `app/` | Active |
| AP2 | Nitro server / API | Server runtime + REST API | Chat + prompt endpoints | `server/api/**` | Active |
| AP3 | Data access layer (Drizzle) | Internal module | ORM over PostgreSQL | `server/db/*` | Active |
| AP4 | Chat engine (non-streaming) | Internal module | One-shot Claude chat | `server/lib/agent.ts` | Active |
| AP5 | Chat engine (streaming) | Internal module | Streaming Claude chat | `server/lib/agent-streaming.ts` | Active |
| AP6 | Agent loader | Internal module | Load agent prompts from markdown | `server/lib/agents.ts` | Active |
| AP7 | MCP server | Internal module | Expose prompts over MCP | `server/mcp/server.ts`, `server/routes/mcp.*` | Active |
| AP8 | Prompt service | Internal module | Prompt CRUD + history + validation | `server/lib/prompts.ts` | Active |
| AP9 | Prompt improver | Internal module + agent | Rewrite prompts via Claude | `server/lib/prompt-improver.ts` | Active |
| AP10 | Session service | Internal module | Mint session ids; store conversation | `server/lib/session.ts` | Active (partial) |
| AP11 | CLI agent | CLI tool | One-shot orchestrator query | `cli/agent.ts` | Active |
| AP12 | Shared types | Internal module | Zod-schemas/types shared client/server | `shared/types/` | Active |

---

## 4.2 Interface catalog

### Chat / session API (source: `server/api/**`)

| Method | Endpoint | Auth | Purpose | Source |
|--------|----------|------|---------|--------|
| POST | `/api/agent` | none | Non-streaming chat | `server/api/agent.post.ts` |
| POST | `/api/agent-stream` | none | Streaming chat (SSE) | `server/api/agent-stream.post.ts` |
| POST | `/api/stream-test` | none | LLM-free streaming reference | `server/api/stream-test.post.ts` |
| GET | `/api/new-thread` | none | Start a fresh session | `server/api/new-thread.ts` |
| GET | `/api/login` | none | Init a session (stub) | `server/api/login.ts` |

### Prompts API (REST, source: `server/api/prompts/**`)

| Method | Endpoint | Auth | Purpose | Source |
|--------|----------|------|---------|--------|
| GET | `/api/prompts` | none | List (limit/offset/tag) | `index.get.ts` |
| POST | `/api/prompts` | none | Create (201 / 409 dup) | `index.post.ts` |
| GET | `/api/prompts/:id` | none | Get one | `[id].get.ts` |
| PUT | `/api/prompts/:id` | none | Update (version+1, history snapshot) | `[id].put.ts` |
| DELETE | `/api/prompts/:id` | none | Delete (history snapshot) | `[id].delete.ts` |
| GET | `/api/prompts/:id/history` | none | List version history | `[id]/history.get.ts` |
| POST | `/api/prompts/improve` | none | Improve prompt content (no DB write) | `improve.post.ts` |

### MCP endpoint (JSON-RPC over Streamable HTTP)

| Method | Endpoint | Auth | Purpose | Source |
|--------|----------|------|---------|--------|
| POST | `/mcp` | none (CORS enabled) | MCP `prompts/list`, `prompts/get` (stateless) | `server/routes/mcp.post.ts` |
| GET | `/mcp` | — | 405 (no SSE/session support) | `server/routes/mcp.get.ts` |
| DELETE | `/mcp` | — | 405 | `server/routes/mcp.delete.ts` |
| OPTIONS | `/mcp` | — | 204 (CORS preflight) | `server/routes/mcp.options.ts` |

---

## 4.3 External integrations

| Integration | Direction | Protocol | Purpose | Source |
|-------------|-----------|----------|---------|--------|
| Anthropic (Claude) | Outbound | HTTPS (`@anthropic-ai/sdk`) | Chat + prompt-improver backing | `server/lib/agent*.ts`, `prompt-improver.ts` |
| Local Anthropic-API-shaped service | Outbound (optional) | HTTPS via `AGENT_BASE_URL` | Redirect streaming client for dev | ADR-0003, `server/lib/agent-streaming.ts` |
| MCP clients (Claude Desktop, etc.) | Inbound | MCP Streamable HTTP | Consume prompts | `server/mcp/server.ts`, `app/lib/mcp-client.ts` |
| PostgreSQL | Outbound | Postgres wire protocol | Prompt data | `server/db/client.ts` |
| Google Fonts | Outbound (browser) | HTTPS | Inter / JetBrains Mono fonts | `app/layouts/app.vue`, `app/pages/index.vue` |

---

## 4.4 Matrices

### Application / Organization (actor) matrix

| Application | A1 User | A2 MCP client | A3 CLI | A4 Anthropic |
|-------------|:--:|:--:|:--:|:--:|
| AP1 frontend | ● | | | |
| AP2 Nitro API | ● | | | |
| AP3 Drizzle | | | | |
| AP4/AP5 chat engines | ● (via API) | | | ● |
| AP7 MCP server | | ● | | |
| AP8 prompt service | ● (via API) | ● (via AP7) | | |
| AP9 prompt improver | ● (via API) | | | ● |
| AP11 CLI | | | ● | ● |

### Application / Function matrix (realization)

| Function (from `02` §2.3) | Realizing application |
|----------------------------|-----------------------|
| F1 Landing | AP1 |
| F2 Chat (non-stream) | AP1 + AP2 + AP4 + AP10 |
| F3 Chat (stream) | AP1 + AP2 + AP5 + AP10 + AP7 (prompt resolve) |
| F4 Stream reference | AP1 + AP2 |
| F5 Prompt CRUD | AP1 + AP2 + AP3 + AP8 |
| F6 Version history | AP2 + AP3 + AP8 |
| F7 Prompt improvement | AP2 + AP9 + AP6 |
| F8 Compare UI | AP1 + AP2 (history) + `superdiff` |
| F9 MCP exposure | AP7 + AP8 + AP3 |
| F10 Agent loading | AP6 |
| F11 Sessions | AP10 |
| F12 CLI query | AP11 + AP6 |

### Application Interaction matrix (key flows)

| From → To | AP2 API | AP3 Drizzle | AP7 MCP | Anthropic | AP10 Session |
|-----------|:--:|:--:|:--:|:--:|:--:|
| AP1 frontend | ● | | ● (mcp-client) | | |
| AP4 chat (non-stream) | | | | ● | ● |
| AP5 chat (stream) | | | ● (in-memory) | ● | ● |
| AP7 MCP server | | ● | | | |
| AP8 prompt service | | ● | | | |
| AP9 prompt improver | | | | ● | |
| AP11 CLI | | | | ● | |

---

## 4.5 Application communication diagram

```
┌────────────┐  REST/SSE   ┌───────────────────────────────┐
│  Browser   │────────────►│  Nuxt/Nitro (simple-ai-os)    │
│ (Vue SPA)  │             │                               │
└────────────┘             │  app/pages ─► server/api       │
                           │     │             │            │
┌────────────┐  MCP JSON-  │     │      server/lib          │
│ MCP client │──RPC /mcp──►│     │       │  ├─ agent.ts     │──► Anthropic
└────────────┘             │     │       │  ├─ agent-stream │──► Anthropic
                           │     │       │  ├─ prompts.ts   │──► PostgreSQL
┌────────────┐  (direct)   │     │       │  ├─ session.ts   │──► ./data/sessions
│    CLI     │────────────►│     │       │  └─ mcp/server   │
└────────────┘             │     │       ▼                  │
                           │     │  server/agents/*.md      │
                           │     └──────────────────────────┘
                           └───────────────────────────────┘
```

Streaming specifics (`app/lib/streaming.ts` → `$fetch({ responseType: 'stream' })` →
`ReadableStream` reader → async generator of text chunks) are described in `CLAUDE.md`
and `server/lib/agent-streaming.ts`.

---

## 4.6 Key architectural decisions (from ADRs)

| # | Decision | Rationale | Source |
|---|----------|-----------|--------|
| AD-1 | Denormalized, unlinked `prompt_history` table (no FK) | History must survive prompt deletion; avoids soft-delete complexity | `docs/architecture/ADR/0001-prompt-version-history.md` |
| AD-2 | Version comparison UI via `@donedeal0/superdiff`, diff against live form | Compare in-progress edits; zero-dep library; scope limited to content/description/variables | `docs/architecture/ADR/0002-prompt-version-comparison-ui.md` |
| AD-3 | `AGENT_BASE_URL` env var for the streaming client only | Redirect streaming to a local Anthropic-API-shaped service without affecting non-streaming path | `docs/architecture/ADR/0003-streaming-agent-configurable-base-url.md` |
| AD-4 | Dynamic agent loading from `server/agents/<name>/agent.md` | Adding an agent = adding a directory (no code change) | `server/lib/agents.ts`, `docs/changes.md` |
| AD-5 | Stateless MCP (fresh server per request, `sessionIdGenerator: undefined`) | Prompt list always reflects current DB; no session/SSE complexity | `server/mcp/server.ts`, `server/routes/mcp.post.ts` |

---

## 4.7 Open items

1. **No authentication/authorization** on any endpoint; IAM SSO is specified but not implemented (`docs/authentication.md`).
2. **No OpenAPI definitions** — `docs/api/` is empty.
3. **No application support/EOE register** — this is a tutorial project, not a production asset.
4. **Monitoring/observability** — only `console.log` statements; no APM/tracing.
5. **Software distribution** — Docker dev/prod images only; no CI/CD pipeline or registry deployment documented.
