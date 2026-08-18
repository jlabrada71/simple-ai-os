# ADR-0003: Configurable base URL for the streaming agent's Anthropic client

## Status

Accepted (2026-07-31)

## Context

`server/lib/agent-streaming.ts` constructs an `Anthropic` SDK client used by the streaming
chat endpoint (`POST /api/agent-stream`). Until now that client always talked to the real
Anthropic API (`api.anthropic.com`), with only the API key configurable via
`ANTHROPIC_API_KEY`.

For local development it's useful to point the streaming client at a local,
Anthropic-API-shaped service (e.g. a proxy or a locally-hosted model server implementing
the same `/v1/messages` contract) instead of the hosted API — for faster iteration, to
avoid burning real API credits, or to exercise a different underlying model while keeping
the rest of the app (session storage, MCP prompt resolution, SSE streaming) unchanged.

The non-streaming client in `server/lib/agent.ts` (`POST /api/agent`) was intentionally
left out of scope — this change targets only the streaming path.

## Decision

Pass `baseURL: process.env['AGENT_BASE_URL']` to the `Anthropic` client constructed in
`server/lib/agent-streaming.ts`. When `AGENT_BASE_URL` is unset, the Anthropic SDK falls
back to its default base URL (the real Anthropic API), so this is purely additive —
existing setups without the variable are unaffected.

`AGENT_BASE_URL` is documented in `.env.example` alongside `ANTHROPIC_API_KEY`, per this
project's convention of keeping environment parameters in `.env` files. For local
development it's set to `http://localhost:5050` in `.env`, pointing at a local
Anthropic-API-shaped service.

`ANTHROPIC_API_KEY` continues to be sent as `apiKey` regardless of `baseURL` — a local
service can ignore it, but the SDK requires *some* value to be present (or explicitly
omitted) to construct the client.

## Alternatives considered

- **Hardcode a second client instance for local dev, selected by `NODE_ENV`**: rejected —
  adds a branch that has to be kept in sync with the real client's config (system prompt,
  model, etc.) and isn't as easy to toggle per-developer as an env var.
- **Apply the same change to `server/lib/agent.ts`**: deferred — the request was scoped to
  the streaming client only. Nothing prevents the same `baseURL` pattern being applied
  there later if needed; it would be a one-line change following this same shape.
- **Use a separate env var name matching the SDK's own `ANTHROPIC_BASE_URL` convention**:
  rejected — `ANTHROPIC_BASE_URL` is read automatically by the SDK for *any* client in the
  process (including the non-streaming one), which would silently redirect
  `server/lib/agent.ts` too. `AGENT_BASE_URL` is a project-specific name wired explicitly
  only into the streaming client, keeping the two endpoints independently configurable.

## Consequences

- The streaming endpoint can now be redirected to any Anthropic-API-compatible service via
  one env var, with no code change required to switch back (just unset `AGENT_BASE_URL`).
- The two chat implementations (`agent.ts` and `agent-streaming.ts`) can now point at
  different backends, which is a deliberate divergence from their previous behavior of
  always hitting the same API. Anyone debugging a difference between the streaming and
  non-streaming chat pages should check `AGENT_BASE_URL` first.
- The model string (`"claude-sonnet-5"`) is still hardcoded in `agent-streaming.ts` and is
  sent as-is to whatever service `AGENT_BASE_URL` points at. A local service must either
  accept that model name or ignore/remap it — this ADR does not make the model
  configurable.
