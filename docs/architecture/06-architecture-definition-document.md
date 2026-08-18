# 06 — Architecture Definition Document (Baseline)

> **TOGAF deliverable.** Architecture Definition Document (ADD) — the single container
> holding the finalized **baseline** ("as-is") architecture across all domains,
> together with requirements traceability and identified gaps.
>
> This document consolidates `01`–`05`. Target ("to-be") architecture and full gap
> analysis are **out of scope** (they require a target state); outstanding gaps are
> listed for later phases.

---

## 1. Purpose & scope

The Baseline Architecture describes the current state of the `simple-ai-os`
application — a Nuxt 4 **tutorial/reference** app demonstrating chat with the Anthropic
SDK (non-streaming and streaming), a versioned prompt library, and an in-process MCP
server exposing those prompts — backed by PostgreSQL and filesystem session storage.

| Domain | Status | Reference |
|--------|--------|-----------|
| Strategic & Governance | Baseline captured | [`01-architecture-vision.md`](./01-architecture-vision.md) |
| Business | Baseline captured | [`02-business-architecture.md`](./02-business-architecture.md) |
| Data | Baseline captured | [`03-data-architecture.md`](./03-data-architecture.md) |
| Application | Baseline captured | [`04-application-architecture.md`](./04-application-architecture.md) |
| Technology | Baseline captured | [`05-technology-architecture.md`](./05-technology-architecture.md) |

---

## 2. Baseline architecture summary

### 2.1 Business

- **Actors:** end users, MCP clients, CLI operators, the Anthropic LLM, and a future
  IAM SSO (specified, not implemented). (`02` §2.1)
- **Capabilities (12):** landing, non-streaming chat, streaming chat, stream reference,
  prompt CRUD, version history, prompt improvement, version comparison, MCP exposure,
  agent loading, sessions, CLI query. (`02` §2.3)
- **No authenticated roles** — sessions are unauthenticated stubs. (`02` §2.2)

### 2.2 Data

- **Two tables:** `prompts` (current state) and `prompt_history` (denormalized,
  unlinked snapshots; survives deletion). (`03` §3.2)
- **Session/conversation state** in filesystem (`unstorage`), split across two
  namespaces (`session` for history, `assets:sessions` for metadata). (`03` §3.1)
- **No migration tooling** — schema bootstrapped by `docker/init.sql`. (`03` §3.8)

### 2.3 Application

- **One application** (`simple-ai-os`) with two parallel chat implementations
  (non-streaming and streaming), a prompt CRUD service with version history, an MCP
  server, and a CLI. (`04` §4.1)
- **Interfaces:** chat/session API, prompts REST API, and a stateless MCP endpoint
  (`POST /mcp`). (`04` §4.2)
- **Integrations:** Anthropic API (optional local override via `AGENT_BASE_URL`),
  inbound MCP clients, PostgreSQL. (`04` §4.3)

### 2.4 Technology

- **Platform:** Node.js; Nuxt 4 / Vue 3 / Nitro; Tailwind CSS 4; TypeScript.
- **Data:** PostgreSQL 18 + Drizzle ORM; `unstorage` fs for sessions.
- **AI:** Anthropic SDK (Claude); MCP SDK.
- **Testing:** Vitest (unit) + Playwright (e2e).
- **Packaging:** multi-stage Docker (dev + prod) + Docker Compose with Postgres.
  (`05` §5.6)

---

## 3. Requirements traceability

| Driver (from `01` §2) | Realized by (capability → application → data) |
|------------------------|-----------------------------------------------|
| D1 Anthropic SDK demo | F2/F3 → AP4/AP5 → Anthropic API + session store |
| D2 Prompt management | F5/F6 → AP8 → `prompts`, `prompt_history` |
| D3 MCP exposure | F9 → AP7 → `prompts` (fresh read) |
| D4 Prompt improvement | F7 → AP9 → Anthropic API |
| D5 Streaming reference | F4 → AP2 → (LLM-free `ReadableStream`) |
| D6 Reference practices | i18n/a11y/ADR/tests → `nuxt.config.ts`, `docs/` |
| D7 SSO readiness | (not realized) → `docs/authentication.md` only |

---

## 4. Architecture principles coverage (from `01` §4)

| Principle | Enforced by | Reference |
|-----------|-------------|-----------|
| P1 Frontend/server/shared split | Nuxt 4 directory layout | `app/`, `server/`, `shared/` |
| P2 Config-as-environment | `.env` + `.env.example` | `.env.example` |
| P3 Schema-validated interfaces | Zod schemas | `shared/types/chat.ts`, `server/lib/prompts.ts` |
| P4 Data integrity & auditability | `prompt_history` snapshots | `server/lib/prompts.ts`, ADR-0001 |
| P5 Stateless MCP | Fresh server per request | `server/mcp/server.ts` |
| P6 i18n & accessibility | `@nuxtjs/i18n`, `@nuxt/a11y` | `nuxt.config.ts` |
| P7 Decision traceability | ADRs | `docs/architecture/ADR/` |
| P8 Learning capture | changes.md / learnings.md | `CLAUDE.md`, `docs/` |

---

## 5. Architecture building blocks (ABBs) — baseline (summary)

| Building block | Type | Definition | Reuse |
|----------------|------|------------|-------|
| Chat engine | Service | Non-streaming + streaming Claude chat | `server/lib/agent.ts`, `agent-streaming.ts` |
| Agent loader | Service | Load system prompts from markdown | `server/lib/agents.ts` |
| Prompt service | Service | CRUD + version history + validation | `server/lib/prompts.ts` |
| MCP server | Service | Stateless Streamable HTTP MCP for prompts | `server/mcp/server.ts` |
| Prompt improver | Service | Rewrite prompts via Claude | `server/lib/prompt-improver.ts` |
| Session service | Service | Mint session ids; store conversation | `server/lib/session.ts` |
| Streaming client | Function | `$fetch` stream reader → async generator | `app/lib/streaming.ts` |
| MCP web client | Function | Browser-side MCP client (singleton) | `app/lib/mcp-client.ts` |

---

## 6. Consolidated gap register

> Baseline vs. Target gap analysis is deferred (no target architecture yet). The
> following are **baseline completeness gaps** (unknowns in the as-is description).

| # | Gap | Domain | Owner (suggested) | Action |
|---|-----|--------|-------------------|--------|
| G1 | Project identity (`client-tutorial` vs "Simple AI OS") unresolved | Strategic | Engineering | Rename package / confirm brand |
| G2 | No authentication — IAM SSO only specified, not implemented | Application | Engineering | Implement per `docs/authentication.md`; resolve its 15 open questions |
| G3 | No DB migration tooling (schema via `docker/init.sql` only) | Data | Engineering | Introduce Drizzle Kit migrations |
| G4 | Session storage split-brain (`session` vs `assets:sessions`) | Data | Engineering | Unify session namespaces |
| G5 | Hardcoded model + system prompts; non-streaming client ignores `AGENT_BASE_URL` | Application | Engineering | Make model/prompt/base-URL uniformly configurable |
| G6 | No OpenAPI definitions (`docs/api/` empty) | Application | Engineering | Publish OpenAPI for prompts/chat endpoints |
| G7 | Production hosting/topology/CI-CD undocumented | Technology | Operations | Document deployment, add CI/CD |
| G8 | No monitoring/observability (only console logs) | Technology | Operations | Add structured logging/APM |
| G9 | No retention/cleanup for `prompt_history` or sessions | Data | Engineering | Define retention policy (ADR-0001 flags this) |
| G10 | No backup/DR strategy for Postgres or session store | Technology | Operations | Define backup & recovery |

---

## 7. Definition of done (for this baseline)

- [x] All five domains (Strategic, Business, Data, Application, Technology) covered.
- [x] Facts traced to source files (Source column in each catalog/matrix).
- [x] Cross-domain consistency (same actors/entities/components referenced across `01`–`05`).
- [x] Outstanding gaps listed with suggested owners (G1–G10 above).
- [ ] **Pending:** stakeholder validation of inferred items (drivers, principles, hosting).

Supporting decisions are recorded in the [ADR/](./ADR/) directory; the IAM SSO
requirement is specified in [`../authentication.md`](../authentication.md).
