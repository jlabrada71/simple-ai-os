# ADR-0006: Cross-app tenant provisioning via a shared admin API key

## Status

Accepted

## Context

Phase 2 of the multitenancy work (see
`docs/superpowers/specs/2026-08-19-cross-app-tenant-provisioning-design.md`) needed `web/home`
to trigger tenant provisioning in `simple-ai-os` automatically. This is a backend-to-backend
call between two trusted services operated by the same team, not a user-facing surface.

## Decision

Authenticate the call with a static shared secret (`x-admin-api-key` header, SHA-256 +
`timingSafeEqual` comparison), reusing `web/iam`'s existing `requireAdminApiKey` pattern
verbatim rather than inventing a new scheme (`server/utils/hash.ts`,
`server/utils/adminApiAuth.ts`). The call is synchronous and non-fatal: `home`'s own tenant is
never rolled back if the `simple-ai-os` call fails, matching how `home` already treats its
`iam`-app-registration step. `simple-ai-os`'s provisioning function is idempotent (checks for
an existing tenant row before inserting), which is what makes both an inline retry and the new
`db:backfill-simple-ai-os-tenant` script in `home` safe to run repeatedly.

## Alternatives considered

- **OAuth/service-account tokens**: rejected as disproportionate for a same-workspace,
  operator-controlled backend-to-backend call — no external actor ever holds this credential.
- **Fire-and-forget (no response awaited)**: rejected — an admin provisioning a tenant should
  see immediately whether the whole tenant (across both apps) succeeded, not discover a partial
  failure later with no signal.

## Consequences

- **Positive:** one auth pattern (`requireAdminApiKey`) shared across `iam` and now
  `simple-ai-os`, both admin-API surfaces in this workspace.
- **Cost:** the shared secret must be kept in sync between `home`'s
  `NUXT_SIMPLE_AI_OS_ADMIN_API_KEY` and `simple-ai-os`'s `NUXT_ADMIN_API_KEY` per environment -
  a one-time manual step, same category as the existing `iam` app-registration secrets.
