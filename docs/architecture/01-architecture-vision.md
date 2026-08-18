# 01 — Architecture Vision & Strategic / Governance Baseline

> **ADM phase.** Preliminary Phase + Phase A (Architecture Vision).
> **Scope.** Baseline ("as-is") only. Describes the business context, drivers,
> principles, and governance under which the `simple-ai-os` application operates today.

---

## 1. Engagement scope

| Dimension | Current state |
|-----------|---------------|
| Organization | TryYourIdeas (product line: **Simple AI OS**) |
| System in scope | The `simple-ai-os` Nuxt 4 application (marketing landing page, chat UI, prompt library, MCP server) |
| Repository identity | `package.json` name is `client-tutorial`; app brand is "Simple AI OS" |
| Nature | Tutorial/reference project, not production software (`CLAUDE.md`) |
| Domains in scope | Business, Data, Application, Technology |
| Time horizon | Current ("as-is") state; no target architecture defined here |
| Primary surface | `app/pages/*` (index, chat, chat-streaming, stream-test, prompts CRUD, tests) |

---

## 2. Business drivers, goals, and objectives

Grounded in `app/pages/index.vue`, `README.md`, and `CLAUDE.md`.

| # | Driver | Goal / objective | Source |
|---|--------|------------------|--------|
| D1 | Demonstrate Anthropic SDK integration | Show both non-streaming and streaming chat patterns against Claude | `CLAUDE.md`, `server/lib/agent.ts`, `server/lib/agent-streaming.ts` |
| D2 | Demonstrate prompt management | Provide a CRUD prompt library with versioning and variables | `README.md`, `server/api/prompts/**`, `server/lib/prompts.ts` |
| D3 | Expose prompts over MCP | Serve prompts via Model Context Protocol (`prompts/list`, `prompts/get`) | `README.md`, `server/mcp/server.ts`, `server/routes/mcp.post.ts` |
| D4 | Prompt improvement capability | Offer an agent that rewrites prompts in place | `server/agents/prompt-improver/`, `server/lib/prompt-improver.ts` |
| D5 | Teach streaming mechanics | Provide a minimal, LLM-free streaming reference (`stream-test`) | `app/pages/stream-test.vue`, `server/api/stream-test.post.ts` |
| D6 | Reference-quality engineering practices | i18n (en/es/pt), a11y, ADRs, changelog, learnings, tests | `nuxt.config.ts`, `docs/`, `tests/` |
| D7 | SSO readiness (future) | Define an IAM SSO integration requirement (not yet implemented) | `docs/authentication.md` |

---

## 3. Stakeholders

| Stakeholder | Role / concern | Where represented in code |
|-------------|----------------|---------------------------|
| End user / developer | Uses chat, manages prompts, consumes MCP prompts | `app/pages/chat*.vue`, `app/pages/prompts/*`, `app/lib/mcp-client.ts` |
| Tutorial consumer | Studies the streaming vs non-streaming patterns | `CLAUDE.md`, `app/pages/stream-test.vue` |
| MCP client (e.g. Claude Desktop) | Lists/fetches prompts over MCP | `server/routes/mcp.*`, `server/mcp/server.ts` |
| CLI operator | Runs a one-shot agent query from the terminal | `cli/agent.ts` |
| External LLM (Anthropic) | Backs the chat and prompt-improver agents | `@anthropic-ai/sdk`, `server/lib/*` |
| IAM (future SSO) | Will authenticate users once `docs/authentication.md` is implemented | `docs/authentication.md` |

---

## 4. Architecture principles (as-observed)

> Inferred from implementation. No formal principles statement exists in the repo.

| # | Principle | Rationale / evidence |
|---|-----------|----------------------|
| P1 | **Separation of concerns (frontend / server / shared)** | Nuxt 4 layout: `app/` (UI), `server/` (Nitro API + lib), `shared/` (types). `CLAUDE.md` |
| P2 | **Config-as-environment** | All parameters in `.env` (`ANTHROPIC_API_KEY`, `AGENT_BASE_URL`, `DATABASE_URL`, …); no hardcoded secrets. `.env.example` |
| P3 | **Schema-validated interfaces** | Request/response bodies validated with `zod` (`chatRequestSchema`, `createPromptSchema`, …). `shared/types/chat.ts`, `server/lib/prompts.ts` |
| P4 | **Data integrity & auditability** | Prompt edits/deletes snapshot to `prompt_history`; version counter increments. `server/lib/prompts.ts`, ADR-0001 |
| P5 | **Stateless MCP surface** | A fresh MCP server is built from current DB contents per request (no session tracking). `server/mcp/server.ts`, `server/routes/mcp.post.ts` |
| P6 | **Internationalization & accessibility** | `@nuxtjs/i18n` (en/es/pt) and `@nuxt/a11y` modules enabled. `nuxt.config.ts` |
| P7 | **Decision traceability** | Every architecture/tech-stack/design decision documented as an ADR. `CLAUDE.md`, `docs/architecture/ADR/` |
| P8 | **Learning capture** | `docs/changes.md` and `docs/learnings/learnings.md` are updated as required. `CLAUDE.md` |

---

## 5. Governance model

### 5.1 Organizational model for Enterprise Architecture

No dedicated EA team or governance body. Governance is operational, via engineering
conventions (from `CLAUDE.md` and the repo layout):

- **ADRs** for architecture, tech-stack, and design decisions (`docs/architecture/ADR/`).
- **Changelog** (`docs/changes.md`) updated with every change.
- **Learnings** (`docs/learnings/learnings.md`) updated when a new pattern/gotcha is found.
- **Tests** — Vitest unit tests (`server/lib/*.test.ts`, `shared/types/*.test.ts`) and
  Playwright e2e (`tests/e2e/*.spec.ts`).
- **Environment parameters** centralized in `.env` files.

### 5.2 Standards register (as-observed)

| Standard | Version (as pinned) | Category | Source |
|----------|---------------------|----------|--------|
| TypeScript | 6.0.3 | Language | `package.json` |
| Nuxt | 4.4.8 | Meta-framework | `package.json` |
| Vue | 3.5.39 | Frontend framework | `package.json` |
| Tailwind CSS | 4.3.2 (Vite plugin) | Styling | `package.json`, `nuxt.config.ts` |
| Drizzle ORM | 0.45.2 | Data access | `package.json` |
| PostgreSQL | 18 (Docker image) | Database | `docker-compose.yml`, `docker/init.sql` |
| Zod | 4.4.3 | Validation | `package.json` |
| Anthropic SDK | 0.110.0 | LLM integration | `package.json` |
| MCP SDK | 1.29.0 | Model Context Protocol | `package.json` |
| Vitest / Playwright | 4.1.10 / 1.61.1 | Testing | `package.json` |

### 5.3 Open decisions / planned work

- **IAM SSO integration** is specified but not implemented (`docs/authentication.md` §15
  lists 15 open integration questions). This is the single largest "target-side"
  direction visible in the repository.

---

## 6. Architecture Vision (Phase A)

`simple-ai-os` is a single Nuxt 4 application that demonstrates building an AI
operating surface: a chat interface (with non-streaming and streaming variants) backed
by the Anthropic SDK, a versioned prompt library, and an in-process MCP server that
exposes those prompts to external MCP clients — all backed by PostgreSQL and
filesystem-based session storage, with agents authored as markdown files loaded
dynamically at runtime.

Component decomposition:

```
Browser ──► Nuxt 4 app (Vue pages) ──► Nitro API routes ──► Anthropic SDK (Claude)
                                          │                    │
                                          ├──► Drizzle ──► PostgreSQL (prompts, prompt_history)
                                          ├──► unstorage ──► ./data/sessions (fs)
                                          └──► MCP server (in-process) ◄── MCP clients (POST /mcp)
```

---

## 7. Capability assessment (summary)

| Capability | Current maturity (observed) | Evidence |
|-----------|------------------------------|----------|
| LLM chat (non-streaming + streaming) | Implemented (two parallel variants) | `server/lib/agent.ts`, `server/lib/agent-streaming.ts` |
| Prompt library CRUD + version history | Implemented | `server/lib/prompts.ts`, `server/api/prompts/**` |
| MCP prompt exposure | Implemented (stateless Streamable HTTP) | `server/mcp/server.ts`, `server/routes/mcp.*` |
| Prompt improvement agent | Implemented | `server/lib/prompt-improver.ts` |
| Agent definition loading | Implemented (markdown-based, dynamic) | `server/lib/agents.ts`, `server/agents/*` |
| Session/conversation state | Partial (two divergent storage namespaces; see `03`) | `server/lib/session.ts`, `server/lib/agent*.ts` |
| Authentication (IAM SSO) | Specified, **not implemented** | `docs/authentication.md` |
| Automated DB migration | **Not implemented** (schema via `docker/init.sql` only) | `docker/init.sql` |

---

## 8. Open issues / gaps (to be confirmed with stakeholders)

1. **Project identity** — `package.json` name `client-tutorial` vs. brand "Simple AI OS" is unresolved.
2. **No formal business strategy / principles statement** — drivers and P1–P8 are inferred.
3. **No authentication in the app itself** — sessions are unauthenticated stubs
   (`session.ts` sets a hardcoded `userId: '123'`, `role: 'admin'`); IAM SSO is only a
   requirements document.
4. **No database migration tooling** — schema is created only by `docker/init.sql` at
   first boot; Drizzle schema mirrors it manually.
5. **Session storage split-brain** — `initSession` writes to `assets:sessions` while chat
   history reads/writes the `session` namespace (`CLAUDE.md` flags this explicitly).
6. **Hardcoded values** — model string `claude-sonnet-5` and system prompts are
   hardcoded; the streaming client reads `AGENT_BASE_URL` but the non-streaming client
   does not (ADR-0003).
7. **Production hosting / deployment topology** is not documented in-repo (only Docker
   dev/prod images and local Postgres).
