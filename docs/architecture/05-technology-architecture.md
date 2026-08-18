# 05 — Baseline Technology Architecture

> **ADM phase.** Phase D (Technology Architecture).
> Describes the *current* technology platform: runtime, frameworks, libraries,
> hosting, and the technology standards in force.

---

## 5.1 Technology Standards catalog

| # | Standard / product | Version (as pinned) | Category | Source |
|---|--------------------|---------------------|----------|--------|
| T1 | Node.js runtime | node:22-alpine (Docker) | Runtime | `Dockerfile` |
| T2 | TypeScript | 6.0.3 | Language | `package.json` |
| T3 | Vue | 3.5.39 | Frontend framework | `package.json` |
| T4 | Nuxt | 4.4.8 | Meta-framework | `package.json` |
| T5 | Tailwind CSS | 4.3.2 (Vite plugin) | Styling | `package.json`, `nuxt.config.ts` |
| T6 | PostgreSQL | 18 (Docker image `postgres:18-alpine`) | Database | `docker-compose.yml` |
| T7 | Drizzle ORM | 0.45.2 | Data access | `package.json` |
| T8 | Zod | 4.4.3 | Validation | `package.json` |
| T9 | Anthropic SDK | 0.110.0 | LLM integration | `package.json` |
| T10 | MCP SDK | 1.29.0 | Model Context Protocol | `package.json` |
| T11 | unstorage | 1.17.5 | KV/storage abstraction | `package.json` |
| T12 | Vitest | 4.1.10 | Unit testing | `package.json` |
| T13 | Playwright | 1.61.1 | Browser E2E testing | `package.json` |
| T14 | ESLint | 10.6.0 | Linting | `package.json` |
| T15 | superdiff (`@donedeal0/superdiff`) | 4.2.2 | Text/list diffing | `package.json` |

### Enabled Nuxt modules (source: `nuxt.config.ts`)

`@nuxt/a11y`, `@nuxt/eslint`, `@nuxt/icon`, `@nuxt/image`, `@nuxt/test-utils`,
`@nuxtjs/i18n`, `@nuxtjs/mdc` (with global prose components under
`app/components/prose`).

---

## 5.2 Technology Portfolio catalog

### Software

| Component | Technology | Purpose | Source |
|-----------|-----------|---------|--------|
| Web framework | Nuxt 4 / Vue 3 / Nitro | SSR/CSR app + server | `nuxt.config.ts` |
| Styling | Tailwind CSS 4 (Vite) | UI styling | `nuxt.config.ts`, `app/assets/css/main.css` |
| Markdown rendering | `@nuxtjs/mdc` (`<MDC>`) | Render assistant markdown + prose components | `nuxt.config.ts`, `app/components/prose/*` |
| Icons | `@nuxt/icon` (Material Symbols) | Iconography | `app/pages/index.vue` |
| i18n | `@nuxtjs/i18n` (en/es/pt) | Localization | `nuxt.config.ts`, `i18n/locales/*` |
| LLM | `@anthropic-ai/sdk` | Claude chat + prompt improvement | `server/lib/*` |
| MCP | `@modelcontextprotocol/sdk` | MCP server + client | `server/mcp/*`, `app/lib/mcp-client.ts` |
| ORM | Drizzle (`node-postgres` driver) | Typed queries | `server/db/*` |
| Diffing | `@donedeal0/superdiff` | Version comparison UI | ADR-0002 |

### Hardware / hosting (as far as documented)

| Element | Description | Source |
|---------|-------------|--------|
| Local app | `http://localhost:3000` (dev and prod containers) | `docker-compose.yml`, `README.md` |
| Local DB | Postgres `localhost:5433` (host) → `5432` (container) | `docker-compose.yml` |
| Data persistence | Named volume `pgdata` for Postgres; bind-mount `./data` for sessions | `docker-compose.yml` |
| Production hosting | Not documented in-repo (only Docker images) | — |

> There is no CMDB / hardware inventory; production cloud/hosting details are **unknown**.

---

## 5.3 Application / Technology matrix

| Application (from `04` §4.1) | Runtime | Data store | Key framework |
|-------------------------------|---------|------------|---------------|
| AP1 frontend | Node.js | — | Nuxt/Vue/Tailwind |
| AP2 Nitro API | Node.js | — | Nitro/h3 |
| AP3 Data access | Node.js | Postgres | Drizzle |
| AP4/AP5 chat engines | Node.js | filesystem (sessions) | Anthropic SDK |
| AP7 MCP server | Node.js | Postgres (via AP8) | MCP SDK |
| AP8 prompt service | Node.js | Postgres | Drizzle + Zod |
| AP11 CLI | Node.js | — | Anthropic SDK |

---

## 5.4 Environments & Locations

| Environment | Access | DB | Notes | Source |
|-------------|--------|-----|-------|--------|
| Local dev (host) | `http://localhost:3000` | `localhost:5433` | `npm run dev` | `README.md`, `docker-compose.yml` |
| Docker dev | `http://localhost:3000` | `postgres` service | Hot reload, repo bind-mounted | `docker-compose.yml`, `Dockerfile` |
| Docker prod | `http://localhost:3000` | `postgres` service | Multi-stage build, `node .output/server/index.mjs` | `docker-compose.yml`, `Dockerfile` |

---

## 5.5 Platform decomposition (logical)

```
Node.js process (Nuxt/Nitro "simple-ai-os")
├── Frontend (Vue 3 SSR/CSR)
│   ├── pages/ (index, chat, chat-streaming, stream-test, prompts/*)
│   ├── layouts/ (app, default)
│   ├── components/prose/*  (markdown rendering)
│   └── lib/ (streaming.ts, mcp-client.ts)
├── Nitro server
│   ├── api/ (agent, agent-stream, stream-test, new-thread, login, prompts/*)
│   ├── routes/ (mcp: post/get/delete/options)
│   ├── mcp/ (server.ts)
│   ├── lib/ (agent, agent-streaming, agents, session, prompts, prompt-improver, mcp-prompts)
│   └── db/ (client.ts, schema.ts)
├── shared/types (chat.ts)
├── cli/agent.ts (one-shot)
└── External dependencies
    ├── PostgreSQL 18 (prompts, prompt_history)
    ├── filesystem session store (./data/sessions)
    └── Anthropic API (Claude)
```

---

## 5.6 Build, deployment & distribution

| Concern | Current mechanism | Source |
|---------|-------------------|--------|
| Build | `npm run build` (Nuxt) in a multi-stage Docker build | `package.json`, `Dockerfile` |
| Runtime image | `node:22-alpine` running `node .output/server/index.mjs` | `Dockerfile` |
| Dev image | `node:22-alpine` running `npm run dev`, repo bind-mounted | `Dockerfile` |
| Orchestration | Docker Compose (`postgres`, `dev`, `prod` services) | `docker-compose.yml` |
| Post-install | `nuxt prepare` | `package.json` |
| CI/CD | Not documented in-repo | — |
| Secrets | `.env` (gitignored) via `env_file` into containers | `.env.example`, `docker-compose.yml` |

---

## 5.7 Network topology (as-observed)

```
Browser ──HTTP──► Nuxt/Nitro (port 3000) ──► Anthropic API (HTTPS)
   │                    │
   │ (MCP)              └──► PostgreSQL (port 5432, host-mapped 5433)
MCP client ──POST /mcp──► Nuxt/Nitro ──► Drizzle ──► PostgreSQL
   │
   └── (in-process MCP server, no separate port/container)
```

- `/mcp` has CORS enabled via Nitro `routeRules` (`nuxt.config.ts`).
- The streaming chat endpoint is an SSE stream (`sendStream`); the non-streaming
  endpoint returns JSON.

---

## 5.8 Open items

1. Production hosting, reverse proxy, TLS, and process supervision are not documented.
2. No monitoring/alerting/APM configuration (only `console.log`).
3. No backup/DR strategy for Postgres or the session store.
4. No database migration/versioning tooling (schema via `docker/init.sql` only).
5. No CI/CD pipeline or container registry deployment is described.
