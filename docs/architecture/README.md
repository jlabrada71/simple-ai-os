# TOGAF Baseline Architecture — Simple AI OS ("simple-ai-os")

> **Purpose.** This directory holds the **Baseline ("As-Is") Architecture** for the
> `simple-ai-os` application, produced following the TOGAF Architecture Development
> Method (ADM) as scoped in `agents/togaf/baseline-architecture-process.md`. It
> describes only the *current state* of the system as observed in the codebase — not
> the target ("to-be") state.
>
> **Reference standard.** The TOGAF Standard (10th Edition / 9.2), Phases A–D.
>
> **Important context.** The repository's `package.json` still declares the scaffold
> name `client-tutorial`, but the application is branded and described throughout as
> **"Simple AI OS"** (see `app/pages/index.vue`, `CLAUDE.md`, `docs/`). Per `CLAUDE.md`
> it is a **Nuxt 4 tutorial/reference app** demonstrating chat with the Anthropic SDK
> (non-streaming and streaming) plus a versioned prompt library and an MCP server —
> **not** production software; the code intentionally contains teaching-quality
> patterns (missing error handling, hardcoded prompts, duplicated logic).

## Document set

| # | Document | ADM phase | Contents |
|---|----------|-----------|----------|
| 1 | [01-architecture-vision.md](./01-architecture-vision.md) | Preliminary + Phase A | Scope, stakeholders, drivers, principles, governance, vision |
| 2 | [02-business-architecture.md](./02-business-architecture.md) | Phase B | Business architecture: actors, capabilities, services, processes, measures |
| 3 | [03-data-architecture.md](./03-data-architecture.md) | Phase C (Data) | Data architecture: entities, schemas, flows, lifecycle |
| 4 | [04-application-architecture.md](./04-application-architecture.md) | Phase C (Application) | Application architecture: portfolio, interfaces, integrations |
| 5 | [05-technology-architecture.md](./05-technology-architecture.md) | Phase D | Technology architecture: platforms, runtime, hosting, standards |
| 6 | [06-architecture-definition-document.md](./06-architecture-definition-document.md) | Consolidation | Consolidated Architecture Definition Document |
| 7 | [07-target-architecture.md](./07-target-architecture.md) | Phases B–E | **Target ("to-be")** architecture for multitenancy + IAM SSO, with gap analysis and work-package roadmap |

## Supplementary documents (pre-existing)

| Document | Description |
|----------|-------------|
| [ADR/](./ADR/) | Architecture Decision Records (`0001` prompt version history, `0002` version comparison UI, `0003` configurable streaming base URL, `0004` schema-per-tenant multitenancy, `0005` SSO via `nuxt-iam-client`). |
| [`../authentication.md`](../authentication.md) | IAM SSO integration **requirement** (not yet implemented — see `06` §6 gap register). |
| [`../changes.md`](../changes.md) | Work/changelog summary. |
| [`../learnings/learnings.md`](../learnings/learnings.md) | Implementation learnings (e.g. `<MDC>` cache-key collisions). |

## Method note

Facts are traced back to the source code (`app/`, `server/`, `shared/`, `cli/`,
`nuxt.config.ts`, `docker-compose.yml`, `Dockerfile`, `docker/init.sql`,
`.env.example`, and `docs/`). Each catalog/matrix row carries a **Source** column
pointing at the file(s) where the fact is grounded. Items that cannot be grounded in
code or documentation (e.g. formal business strategy, production hosting details) are
marked **Unknown / to be confirmed** rather than invented.

## How to read the catalogs

TOGAF classifies artifacts as **Catalogs** (lists), **Matrices** (relationship
tables), and **Diagrams** (pictures). Each domain document organizes its content
under those headings, following `baseline-architecture-process.md` §5.
