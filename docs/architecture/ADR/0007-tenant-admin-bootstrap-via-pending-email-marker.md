# ADR-0007: Bootstrap the first tenant admin via a pending-email marker in tenant_config

## Status

Accepted (2026-08-21)

## Context

`tenant.users.role` (`'member' | 'admin'`) existed since phase 1 but was never actually checked
anywhere, and every new user was created as `'member'` — there was no admin at all until an
operator manually ran an `UPDATE` against a tenant's schema. The new `/team` page needs at
least one admin to exist for a tenant to be self-service.

## Decision

`home` forwards the tenant owner's email (already collected at provisioning time) to
`simple-ai-os`'s `POST /api/admin/tenants`. `simple-ai-os` stores it as a one-shot
`pending_admin_email` entry in the existing `tenant_config` keyed store (the same table already
used for per-app `iam` integration config). `requireTenantSession`'s first-login user-creation
path checks this marker: a matching email becomes `role: 'admin'` and the marker is deleted;
everyone else is `'member'`, unchanged from today.

Rejected alternative: making `users.iam_sub` nullable and pre-seeding a real `users` row for
the owner before they ever log in. This would need a schema migration, a nullable unique
column, and careful "claim this row on matching login" logic — strictly more moving parts than
reusing the existing keyed-config table for a value that only needs to survive until the first
matching login.

## Consequences

- Tenants provisioned through `home` (which always has an owner email) get a self-service admin
  automatically, with no manual DB step.
- Tenants provisioned via the `simple-ai-os` CLI script or backfill script without an owner
  email still land with zero admins, same as before this change — an operator still promotes
  the first admin manually via SQL in that path. This is an accepted, unchanged gap (see
  `docs/backlog.md`).
- `role` is now load-bearing for exactly one thing: `/team` access. Prompts, chat, and API keys
  remain open to all authenticated tenant members.
