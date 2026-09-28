# 03 — Baseline Data Architecture

> **ADM phase.** Phase C (Information Systems Architectures — Data).
> Describes the *current* data landscape: data stores, entities, schemas, flows, and
> lifecycle as observed in the codebase.

---

## 3.1 Data stores overview

| Store | Engine | Purpose | Used by | Source |
|-------|--------|---------|---------|--------|
| PostgreSQL 18 — `simple-ai-os` DB | Postgres (Docker) | Prompt library (current + history) | Drizzle ORM (`server/db/*`) | `docker-compose.yml`, `server/db/client.ts`, `docker/init.sql` |
| Filesystem session store | `unstorage` `fs` driver | Conversation history per session | `server/lib/agent*.ts` (`useStorage('session')`) | `nuxt.config.ts`, `server/lib/agent.ts` |
| Filesystem assets session store | `unstorage` `fs` driver | Session metadata (`userId`, `role`) | `server/lib/session.ts` (`useStorage('assets:sessions')`) | `nuxt.config.ts`, `server/lib/session.ts` |
| Agent definitions | Markdown files (`server/agents/<name>/agent.md`) | Agent system prompts | `server/lib/agents.ts` | `server/agents/*` |
| Browser cookie | `session_id` (httpOnly) | Correlates requests to a session | `server/lib/session.ts` | `setCookie(...)` |

> **Note (split-brain).** `initSession` writes to the `assets:sessions` namespace while
> chat history lives in the `session` namespace — two separate stores today, flagged as
> such in `CLAUDE.md`.

---

## 3.2 Data Entity / Data Component catalog

Source: `server/db/schema.ts` (Drizzle) and `docker/init.sql` (authoritative DDL).

| Entity | Key fields | Notes | Source |
|--------|-----------|-------|--------|
| `prompts` | `id` (uuid, pk), `name` (unique), `content`, `description`, `tags` (text[]), `variables` (text[]), `version` (int, default 1), `score` (int, default 0), `created_at`, `updated_at` | Current prompt state; `version` increments per update; `score` reserved for future evaluation | `schema.ts`, `init.sql` |
| `prompt_history` | `id` (uuid, pk), `prompt_id` (uuid, **no FK**), `name`, `content`, `description`, `tags`, `variables`, `version`, `score`, `action` (`updated`/`deleted`), `prompt_created_at`, `prompt_updated_at`, `archived_at` | Denormalized snapshots of a prompt at each change; survives parent deletion | `schema.ts`, `init.sql` |

### Non-tabular data entities

| Entity | Classification | Format | Source |
|--------|----------------|--------|--------|
| Agent system prompts | Reference data | Markdown file per agent | `server/agents/*/agent.md` |
| Chat conversation | Session data | `{ messages: Message[], claudeResponse: [...] }` JSON | `server/lib/agent*.ts` |
| Session metadata | Session data | `{ userId, role }` JSON | `server/lib/session.ts` |
| Chat request | Message type | discriminated union (`text` | `prompt`) | `shared/types/chat.ts` |

---

## 3.3 Logical Data diagram

```
prompts (live, version N)
   │  (no FK)
   │  application-level snapshots on update/delete
   ▼
prompt_history (versions 1..N-1 as 'updated', final N as 'deleted')
   • prompt_id indexed (idx_prompt_history_prompt_id)
   • deliberately unlinked so history survives prompt deletion (ADR-0001)
```

Session data (not relational):

```
session_id (httpOnly cookie)
   ├──► assets:sessions/<id>  → { userId, role }        (initSession)
   └──► session/<id>          → { messages, claudeResponse }  (chat history)
```

---

## 3.4 Application / Data matrix

| Entity / store | Chat endpoints | Prompt CRUD | MCP server | Improve | CLI |
|----------------|:--:|:--:|:--:|:--:|:--:|
| `prompts` | R (via MCP) | R/W | R | R | |
| `prompt_history` | | R/W | | | |
| `session` store | R/W | | | | |
| `assets:sessions` store | R/W (init) | | | | |
| Agent markdown | R | | | R | R |

---

## 3.5 Data Dissemination (flows) diagram

```
Browser ── POST /api/prompts* ──────► prompts / prompt_history (Postgres)
Browser ── GET  /api/prompts* ───────► prompts / prompt_history (Postgres)
Browser ── POST /api/prompts/improve► Anthropic (prompt-improver)  (no DB write)
MCP client ── POST /mcp ─────────────► prompts (fresh read per request)

Browser ── POST /api/agent ──────────► Anthropic  +  session store (fs)
Browser ── POST /api/agent-stream ───► Anthropic  +  session store (fs)  [+ MCP prompt resolve]
Browser ── GET /api/new-thread ──────► assets:sessions store (fs)

CLI ── cli/agent.ts ─────────────────► Anthropic (orchestrator)  (no persistence)
```

---

## 3.6 Data Lifecycle

| Entity | Create | Read | Update | Delete | Notes |
|--------|--------|------|--------|--------|-------|
| `prompts` | `createPrompt` | list/get (and via MCP) | `updatePrompt` (version+1) | `deletePrompt` | Delete snapshots final state to history first |
| `prompt_history` | snapshot on update/delete | `listPromptHistory` (`GET /api/prompts/:id/history`) | — | — | **Grows unbounded; no retention policy** (ADR-0001) |
| `session` (conversation) | lazy on first chat turn | load per turn | append messages/response | reset via `new-thread` (new session id) | Old sessions never purged |
| `assets:sessions` | `initSession` | — | — | — | Never cleaned up |

> **Retention**: no cleanup/retention exists for `prompt_history` or any session data.
> The schema is bootstrapped by `docker/init.sql` only; there is **no migration tooling**
> in this project.

---

## 3.7 Data Security & classification (as-observed)

| Concern | Current control | Source |
|---------|-----------------|--------|
| Secrets | `ANTHROPIC_API_KEY`, DB credentials, etc. in `.env` (gitignored); `.env.example` documents keys | `.env.example` |
| Session cookie | httpOnly `session_id` cookie | `server/lib/session.ts` |
| Authentication | **None** — sessions are unauthenticated stubs; no authorization checks | `server/lib/session.ts` |
| Data classification / encryption | No formal classification or field-level encryption | — |
| Tenant/data isolation | N/A (single-tenant tutorial app) | — |

---

## 3.8 Data Migration

| Concern | Current state | Source |
|---------|---------------|--------|
| Schema creation | `docker/init.sql` runs on first Postgres boot (mounts into `docker-entrypoint-initdb.d`) | `docker-compose.yml`, `docker/init.sql` |
| Migrations | **Not implemented** — no drizzle-kit migrations, no `migrate()` calls | (absence in `package.json` scripts and `server/`) |
| Drizzle schema | Mirrors `init.sql` manually (`server/db/schema.ts`) | `server/db/schema.ts` |

---

## 3.9 Conceptual data diagram

```
                    ┌───────────────────────────────────────────┐
                    │  Clients: Browser / MCP client / CLI       │
                    └──────┬──────────────────┬─────────────────┘
                           │ REST (JSON)       │ MCP (JSON-RPC)
                    ┌──────▼──────────────────▼─────────────────┐
                    │        Nuxt / Nitro "simple-ai-os"        │
                    │  API routes ─► Drizzle ─► Postgres         │
                    │            └──► unstorage ─► ./data/sessions│
                    └──────┬──────────────────┬─────────────────┘
                           │                  │
                    ┌──────▼─────┐    ┌───────▼───────────┐
                    │ PostgreSQL │    │ filesystem        │
                    │  prompts   │    │ session data      │
                    │  prompt_   │    │ (assets:sessions /│
                    │  history   │    │  session)         │
                    └────────────┘    └───────────────────┘
                    ┌──────────────────────────────────────┐
                    │ Anthropic API (external, via SDK)    │
                    └──────────────────────────────────────┘
```
