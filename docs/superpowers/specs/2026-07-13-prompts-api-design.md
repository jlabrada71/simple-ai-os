# Prompts API Design

## Purpose

Add a server-side CRUD API for managing "prompts" (reusable prompt templates), backed by a
Postgres database (`simple-ai-os`) running in Docker. This is infrastructure for a future
feature that lets prompts be authored/selected instead of the hardcoded system prompt in
`server/lib/agent.ts` / `server/lib/agent-streaming.ts` — but wiring that up is out of scope
for this change. This change only adds the storage layer and REST API.

## Schema

Table `prompts`, in the `simple-ai-os` Postgres database:

| column      | type          | notes                                      |
|-------------|---------------|---------------------------------------------|
| id          | uuid          | primary key, `default gen_random_uuid()`    |
| name        | text          | not null, unique                            |
| content     | text          | not null — the prompt template text         |
| description | text          | nullable                                    |
| tags        | text[]        | not null, default `'{}'`                    |
| variables   | text[]        | not null, default `'{}'` — placeholder names the template expects |
| version     | integer       | not null, default 1                         |
| created_at  | timestamptz   | not null, default `now()`                   |
| updated_at  | timestamptz   | not null, default `now()`                   |

The `pgcrypto` extension is enabled to provide `gen_random_uuid()`.

`version` is server-managed: it starts at 1 on create and is incremented by 1 on every
successful update. Callers cannot set it directly.

## Dependencies

New npm dependencies:
- `pg` — Postgres driver
- `drizzle-orm` — typed query builder, used against a schema defined in `server/db/schema.ts`
- `zod` — request body validation

Drizzle is used purely as a query builder/typed schema here — no `drizzle-kit` migration
runner is introduced. The table is created via a plain SQL init script (see below), and
`server/db/schema.ts` is hand-maintained to mirror that script's shape.

## Files

- `server/db/schema.ts` — Drizzle `pgTable` definition for `prompts`, exporting inferred
  `Prompt` / `NewPrompt` types.
- `server/db/client.ts` — creates a `pg.Pool` from `process.env.DATABASE_URL` and wraps it in
  `drizzle()`, exported as a singleton `db`.
- `docker/init.sql` — `CREATE EXTENSION IF NOT EXISTS pgcrypto;` + `CREATE TABLE prompts (...)`
  matching the schema above. Mounted into the Postgres container's
  `/docker-entrypoint-initdb.d/` so it runs once on first container start (fresh volume only).
- `server/lib/prompts.ts` — CRUD functions and zod schemas:
  - `listPrompts({ limit, offset, tag })` — paginated, optional single-tag filter (`tags @> ARRAY[tag]`)
  - `createPrompt(input)` — validates with `createPromptSchema` (zod), inserts, returns the row
  - `getPrompt(id)` — returns the row or `null`
  - `updatePrompt(id, input)` — validates with `updatePromptSchema` (all fields optional except
    at least one must be present), increments `version`, refreshes `updated_at`
- `server/api/prompts/index.get.ts` — `GET /api/prompts?limit=&offset=&tag=` → list
- `server/api/prompts/index.post.ts` — `POST /api/prompts` → create
- `server/api/prompts/[id].get.ts` — `GET /api/prompts/:id` → get by id
- `server/api/prompts/[id].put.ts` — `PUT /api/prompts/:id` → update

## API contract

### `GET /api/prompts?limit=20&offset=0&tag=math`
Returns `{ prompts: Prompt[], limit, offset }`, ordered by `created_at desc`. `limit` defaults
to 20 (max 100), `offset` defaults to 0. `tag` is optional; when present, only prompts whose
`tags` array contains that value are returned.

### `POST /api/prompts`
Body: `{ name, content, description?, tags?, variables? }`. Returns the created row (201).
409 if `name` already exists.

### `GET /api/prompts/:id`
Returns the row, or 404 if not found.

### `PUT /api/prompts/:id`
Body: any subset of `{ name, content, description, tags, variables }`. Returns the updated row
with `version` incremented and `updated_at` refreshed. 404 if not found, 409 if renaming to an
existing `name`.

## Error handling

All handlers use h3's `createError` for non-2xx responses:
- 400 — zod validation failure (validation error details in `data`)
- 404 — id not found (get/update)
- 409 — unique `name` conflict (create/update)

## Docker changes

All Postgres credentials/connection info move to `.env` (not hardcoded in `docker-compose.yml`),
consistent with how `ANTHROPIC_API_KEY` is already handled:

```
# .env additions
POSTGRES_DB=simple-ai-os
POSTGRES_USER=simple_ai_os
POSTGRES_PASSWORD=simple_ai_os
DATABASE_URL=postgres://simple_ai_os:simple_ai_os@postgres:5432/simple-ai-os
```

`docker-compose.yml` gains a `postgres` service that reads these via `env_file: .env`:
```yaml
postgres:
  image: postgres:16-alpine
  env_file:
    - .env
  volumes:
    - pgdata:/var/lib/postgresql/data
    - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
  ports:
    - "5432:5432"
```
with a top-level `pgdata` named volume. The `dev` and `prod` services already load `env_file: .env`
(from the earlier Docker setup), so they pick up `DATABASE_URL` automatically once it's added
there; they also get `depends_on: [postgres]`.

A `.env.example` file is added (tracked in git — `.gitignore` already excludes `.env` but
allows `.env.example`) documenting all four required keys with placeholder values, so a fresh
clone knows what to fill in.

Local (non-Docker) `npm run dev` continues to work as long as `DATABASE_URL` in `.env` points at
a reachable Postgres (e.g. `localhost:5432` if Postgres is run separately, or if only the
`postgres` compose service is started standalone).

## Testing

Add `vitest` (+ `@vitest/coverage-v8` not required) as a devDependency with a `vitest.config.ts`
at the project root (node environment, not the Nuxt/browser one — these are plain unit tests of
server-side logic, no Nuxt runtime needed). Add an `npm test` script (`vitest run`).

Unit tests are added **where validation/business logic actually branches** — not a blanket
requirement for every file:
- `server/lib/prompts.test.ts` — the zod schemas and the pure parts of `createPrompt`/
  `updatePrompt`/`listPrompts` (e.g. rejecting an empty `name`, rejecting an update body with no
  fields, defaulting/clamping `limit`/`offset`, rejecting invalid pagination values). The
  database calls themselves are exercised through a mocked `db` module (`vi.mock`) rather than a
  real Postgres connection — no test containers/integration DB in scope here.

No tests are added for the thin `server/api/prompts/*.ts` route handlers themselves, since they
contain no logic beyond calling into `server/lib/prompts.ts` and mapping errors to
`createError` — that mapping is simple enough to cover via the lib-level tests plus manual
verification.

## Out of scope

- No auth/access control on these endpoints (matches the rest of this tutorial app's posture).
- No UI for managing prompts.
- No DELETE endpoint (not requested).
- No wiring of prompts into the chat agent's system prompt.
- No integration tests against a real Postgres instance.
