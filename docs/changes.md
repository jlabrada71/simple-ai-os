# Changes

Summary of work done, most recent first.

## 2026-08-17 (pending, not yet committed)

- **Target architecture for multitenancy + IAM SSO**: added
  `docs/architecture/07-target-architecture.md` describing the target ("to-be") state for
  (1) schema-per-tenant multitenancy (mirroring `web/home`'s public `tenants` registry +
  `tenant_<slug>` schemas, `getTenantDb` pool, `provision-tenant.ts` script) and (2) SSO
  via the shared `lib/nuxt-iam-client` module against `web/iam`, plus a baseline→target
  gap analysis and a five-work-package roadmap. Recorded the two key decisions as
  `docs/architecture/ADR/0004-multitenancy-schema-per-tenant.md` and
  `docs/architecture/ADR/0005-sso-via-nuxt-iam-client.md`.

## 2026-07-31 (pending, not yet committed)

- **Streaming agent client points at a configurable base URL**: `server/lib/agent-streaming.ts`
  now passes `baseURL: process.env['AGENT_BASE_URL']` to its `Anthropic` client, so the
  streaming chat endpoint (`POST /api/agent-stream`) can be redirected to a local,
  Anthropic-API-shaped service (set to `http://localhost:5050` in `.env`) instead of the
  real Anthropic API. Unset, it falls back to the SDK's default (the real API), so this is
  additive. `AGENT_BASE_URL` was added to `.env.example`. The non-streaming client
  (`server/lib/agent.ts`) is unchanged and still always hits the real API. Recorded as
  `docs/ADR/0003-streaming-agent-configurable-base-url.md`.

## 2026-07-16 (pending, not yet committed)

- **Disable Save until the form actually changes**: the Edit Prompt form's Save button is
  now disabled until at least one field (`name`, `content`, `description`, `tags`,
  `variables`) differs from the last-loaded/last-saved values, via a snapshot taken on load
  and compared with a computed. Prevents accidental no-op saves.
- **Vite dependency pre-bundling for `@donedeal0/superdiff`**: added it to
  `nuxt.config.ts`'s `vite.optimizeDeps.include`, alongside the existing MCP SDK entries.
  Without it, Vite discovered the dependency at request time and triggered a full page
  reload mid-request, which was intermittently breaking Playwright specs that navigate to
  the Edit Prompt page (the page a client had already loaded would reload out from under
  it). Same class of issue the existing MCP SDK entries in that list were already there to
  prevent.

## 2026-07-16

- **Prompt version history**: new `prompt_history` table (`server/db/schema.ts`,
  `docker/init.sql`) that snapshots a prompt's full state on every change. `updatePrompt`
  now records the pre-update row (`action: "updated"`) before applying an edit;
  `deletePrompt` records the final row (`action: "deleted"`) before removing it from the
  live table. `prompt_history` deliberately has no foreign key back to `prompts`, so a
  prompt's history — including its last known state — survives the prompt itself being
  deleted. New endpoint: `GET /api/prompts/:id/history`, which works even for prompts that
  no longer exist. Both operations run inside a transaction. Recorded the reasoning as
  `docs/ADR/0001-prompt-version-history.md` (first ADR in the project).
- **Compare prompt versions in the Edit Prompt form**: a "Compare with a previous version"
  toggle reveals a read-only panel next to the edit form with a dropdown of past versions
  (from the history endpoint above). Picking one shows its Content/Description/Variables
  plus a live diff against whatever's currently in the form, using `@donedeal0/superdiff`
  (`getTextDiff` for Content/Description, `getListDiff` for Variables). Two real bugs found
  and fixed along the way: loading history lazily via the dropdown's `@focus` event was
  unreliable, so it now loads as soon as the toggle is switched on; and diff tokens were
  rendering with no spaces between words because Vue's whitespace-condensing was eating a
  literal space in the template, fixed by baking the space into the interpolated string.
  Also hit a real Docker gotcha: `npm install`ing the new dependency inside an already-running
  container updated `package.json`/`package-lock.json` on the host but not the image itself
  (the Dockerfile's `npm ci` only runs at build time, and the live install lived in an
  anonymous volume that didn't survive the container being recreated) — fixed by rebuilding
  with `docker compose up -d --build -V postgres dev`. Recorded the library/baseline/scope
  decisions as `docs/ADR/0002-prompt-version-comparison-ui.md`.
- **Remove Delete button from the Edit Prompt form** — deleting a prompt is still
  available from the prompts list; the edit form no longer has its own delete action.
- **Fix Vue "Failed to resolve component" warnings** on the Edit Prompt page — the "tips"
  section's XML-tag examples (`<my_data>`, `<my_code>`, `<code_docs>`) were written as raw
  tags in the template, so Vue tried to resolve them as components. Escaped as HTML
  entities so they render as visible example text instead.
- **Prompt Improver**: new `prompt-improver` agent (`server/agents/prompt-improver/agent.md`)
  and `POST /api/prompts/improve`, which rewrites a prompt's `content` via that agent
  without touching the database. Added an "Improve" button to the Edit Prompt form that
  fills the Content field with the result; the user still has to click Save to persist it.
  Along the way, found and fixed a real prompt-quality bug where the agent would sometimes
  echo its own system prompt's illustrative example instead of rewriting the user's actual
  prompt.
- **Prompt list actions**: replaced the "Edit"/"Delete" text links in the prompts table
  with icon buttons (pencil / trash), keeping `aria-label`s for accessibility.
- **Agents refactor**: `server/lib/agents.ts` now dynamically loads agent system prompts
  from `server/agents/<name>/agent.md` instead of a hardcoded object, so adding a new agent
  is just adding a new directory. Added a `getAgent()` helper for safe lookups. (Hit and
  fixed a real bug here: an `import.meta.url`-based path broke under Nitro's server
  bundling — switched to a `process.cwd()`-relative path.)

## 2026-07-15

- **Chat-streaming and Prompts pages redesign**: reused the Stitch-generated design system
  from the index page redesign (indigo/Inter/JetBrains Mono) across `chat-streaming.vue`
  and all three prompts pages (`index.vue`, `new.vue`, `[id].vue`). Added a shared top nav
  layout (`app/layouts/app.vue`) with active-route highlighting. Chat messages now render
  as left/right bubbles instead of a plain list; the prompts table got styled tag chips and
  a consistent button/form treatment.
- Added Playwright as the project's e2e test tool, with specs covering the chat-streaming
  send flow and the full prompts create → edit → delete flow. Found and fixed a real
  hydration-timing race in the prompts edit flow (the edit page's async prompt fetch could
  resolve after a test had already started typing, overwriting the typed value).
- Fixed a table layout bug on the prompts list page: the Actions `<td>` had `display: flex`
  directly on it, which broke the row's border/height alignment with its sibling cells.
