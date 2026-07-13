# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Docker

Make sure `ANTHROPIC_API_KEY` is set in `.env` at the project root before running either service — it's passed into the container via `env_file`.

Chat session history (`./data/sessions`) is bind-mounted from the host, so it persists across container restarts for both services.

### Development (hot reload)

```bash
docker compose up dev
```

Runs `npm run dev` inside the container with the repo bind-mounted, so file changes on the host are picked up live. Available at `http://localhost:3000`.

### Production

```bash
docker compose up prod
```

Builds the app (`npm run build`) in a build stage, then runs the compiled output (`node .output/server/index.mjs`) in a minimal runtime image. Available at `http://localhost:3000`.

### Building without compose

```bash
# dev image
docker build --target dev -t simple-ai-os:dev .

# production image
docker build --target prod -t simple-ai-os:prod .
```

The `dev`/`prod` app services also depend on a `postgres` service (see below) and read
`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `DATABASE_URL` from `.env` — copy
`.env.example` to `.env` and fill in `ANTHROPIC_API_KEY` to get started. Postgres itself is
reachable from the host at `localhost:5433` (mapped from its internal port 5432, to avoid
clashing with any other Postgres already using 5432 on your machine).

## Prompts API

A CRUD REST API for managing reusable prompt templates, backed by the `prompts` table in the
`simple-ai-os` Postgres database (see `docker/init.sql` for the schema). A prompt has a unique
`name`, `content` (the template text, which may contain `{{variable}}` placeholders),
an optional `description`, `tags` and `variables` (string arrays), and a server-managed
`version` that increments on every update.

There's also a UI for managing prompts at `/prompts` (list/create/edit/delete) once the app is
running.

### `GET /api/prompts?limit=20&offset=0&tag=math`

Lists prompts, newest first. `limit` (default 20, max 100), `offset` (default 0), and `tag`
(optional, filters to prompts whose `tags` array contains that value) are all optional query
params.

```bash
curl 'http://localhost:3000/api/prompts?tag=math'
```

### `POST /api/prompts`

Creates a prompt. Body: `{ name, content, description?, tags?, variables? }`. Returns the
created row (`201`). `409` if `name` already exists, `400` on validation failure.

```bash
curl -X POST http://localhost:3000/api/prompts \
  -H 'content-type: application/json' \
  -d '{"name":"greeting","content":"Hello, {{name}}!","tags":["demo"],"variables":["name"]}'
```

### `GET /api/prompts/:id`

Returns a single prompt by id, or `404` if it doesn't exist.

### `PUT /api/prompts/:id`

Updates a prompt. Body: any subset of `{ name, content, description, tags, variables }` (at
least one field required). Increments `version` and refreshes `updated_at`. `404` if not
found, `409` if renaming to an existing `name`.

```bash
curl -X PUT http://localhost:3000/api/prompts/<id> \
  -H 'content-type: application/json' \
  -d '{"content":"Hi, {{name}}!"}'
```

### `DELETE /api/prompts/:id`

Deletes a prompt and returns the deleted row, or `404` if it doesn't exist.

```bash
curl -X DELETE http://localhost:3000/api/prompts/<id>
```

## Prompts MCP Server

The same prompts are also exposed over the [Model Context Protocol](https://modelcontextprotocol.io)
using MCP's native `prompts` primitive, so MCP clients (e.g. Claude Desktop) can list and fetch
them directly. The MCP server runs inside the same Nitro process as the rest of the app —
there's no separate port or container — reachable at:

```
POST http://localhost:3000/mcp
```

It uses the Streamable HTTP transport in **stateless** mode (no `Mcp-Session-Id` tracking): a
fresh server instance is built from the current database contents on every request, so the
prompt list is always up to date. `GET`/`DELETE /mcp` return `405`, since this server doesn't
support server-initiated SSE streams or session termination.

Each prompt's `variables` become MCP prompt arguments. When a client calls `prompts/get` with
argument values, any matching `{{variable}}` placeholders in `content` are substituted;
unmatched placeholders are left as-is.

Example JSON-RPC exchange:

```bash
# List prompts
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"prompts/list","params":{}}'

# Get a prompt, substituting its "name" argument
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"prompts/get","params":{"name":"greeting","arguments":{"name":"Ada"}}}'
```


## Test MCP server
```bash
npx @modelcontextprotocol/inspector
```