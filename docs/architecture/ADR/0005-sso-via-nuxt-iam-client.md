# ADR-0005: SSO via `iam` using the shared `nuxt-iam-client` module

## Status

Accepted — implemented per `docs/superpowers/plans/2026-08-19-multitenancy-sso.md`

## Context

`simple-ai-os` has no authentication today — `server/lib/session.ts` mints an
unauthenticated stub (`userId: '123'`, `role: 'admin'`) and the requirement for `iam` SSO
exists only as `docs/authentication.md`. The workspace already operates a centralized
identity service, `web/iam` (passwordless email-code auth, authorization-code flow), and
has already extracted the SSO **client** into a shared Nuxt module,
`lib/nuxt-iam-client`, precisely so other Nuxt apps can adopt `iam` without re-implementing
the security-sensitive handshake (see `ADR-shared-libraries-directory.md`). `web/home` has
already adopted this exact module for its admin login (see
`ADR-admin-sso-via-iam.md`).

## Decision

Integrate SSO by consuming `lib/nuxt-iam-client` rather than hand-rolling the flow:

1. Register `simple-ai-os` as an application in `iam` (obtaining `app_id`/`client_secret`
   and registering `authenticated_url`/`not_authenticated_url`) — a one-time step per
   environment via `iam`'s `/admin` dashboard.
2. Mount `nuxt-iam-client` as a Nuxt module with server-only runtime config
   (`NUXT_IAM_URL`, `NUXT_IAM_APP_ID`, `NUXT_IAM_CLIENT_SECRET`), using
   `routePrefix`/`composableAlias` if any route/composable collision with app code arises
   (the pattern `home` needed).
3. Rely on the module's pieces: `GET /api/auth/login` (state/nonce → redirect to
   `iam` `/auth`), the global middleware that resolves `?code=&state=` by validating
   `state`, exchanging the code at `iam`'s `POST /token` with the client credentials,
   validating the `id_token` (`sub`/`nonce`/`aud`/`exp`), and creating a local session;
   `GET /api/auth/session` and `POST /api/auth/logout`; and the `useAuth()` composable.
4. Delete the baseline stub auth (`server/lib/session.ts`, `GET /api/login`,
   `GET /api/new-thread`'s `assets:sessions` namespace); identity now comes from the
   `iam` session, and authorization is enforced locally (`tenant.users.role`, mirroring
   `home`'s `requireAdminSession` wrapper over `getIamSession()`).
5. Mount a persistent driver for the module's `iam:sessions` storage namespace in
   production (the in-memory default does not survive restarts or scale past one instance).

## Alternatives considered

- **Hand-roll the OAuth-style flow in-app**: rejected — duplicates security-sensitive
  logic (state/nonce validation, token exchange, refresh-token rotation) already fixed in
  one place in `nuxt-iam-client`; a bug fixed there would silently stay broken here.
- **Server-to-server callback (`POST authenticated-url` with token + email, per the old
  `docs/authentication.md`)**: rejected — superseded by `iam`'s current authorization-code
  redirect contract (`authenticated_url?code=&state=`), which keeps usable tokens out of
  the browser and off the redirect URL.
- **Keep a separate local email+code login**: rejected — duplicates `iam`; violates the
  "one identity service" model the workspace converged on.

## Consequences

- **Positive:** identity is fully delegated to `iam`; no local password/code handling;
  local session uses an httpOnly cookie, and `iam` tokens stay server-side.
- **Positive:** one SSO implementation shared across `home`, `TestIam`, and
  `simple-ai-os`.
- **Cost / inherited gap:** `iam` Phase 1 signs with **HS256** (shared `IAM_JWT_SECRET`,
  no JWKS) and exposes **no token introspection**; `nuxt-iam-client` decodes the
  `id_token` but does **not** verify its signature. Until `iam` adds RS256/JWKS +
  introspection, token *integrity* relies on the client-secret-authenticated
  server-to-server exchange being over HTTPS, and on the fact that the browser only ever
  carries the one-time code. This is acceptable for the near term but must be closed
  before any bearer-authenticated MCP or API surface trusts a JWT signature (tracked in
  `07` §7.2).
- **Cost:** each environment needs a one-time `iam` app registration before login works;
  no return-path preservation through the code exchange (same limitation `home` accepted).
- **Cost:** `iam` sessions must be persisted (Redis/DB) for production; the module default
  is in-memory.
