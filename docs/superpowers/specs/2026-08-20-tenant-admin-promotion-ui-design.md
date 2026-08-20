# Design: Tenant-admin promotion UI

## Context

`tenant.users.role` (`'member' | 'admin'`) has existed since phase 1 but is a dead field —
nothing in the codebase checks it. Every user who completes SSO login is created as `role:
'member'` (`server/utils/requireTenantSession.ts`), and there is no admin at all until someone
manually runs an `UPDATE` against the tenant's schema. This is `docs/backlog.md`'s "Tenant-admin
promotion UI" item.

This round gives `role` an actual purpose (gating team management), a way to seed the first
admin without a manual DB step, and a UI for admins to promote/demote afterward.

## What "admin" gates

Scope is deliberately narrow: **admin-only capability is managing team membership (viewing the
user list, promoting/demoting roles)**. Chat, prompts, and API keys remain open to all
authenticated tenant members, unchanged. Extending admin-gating to other areas (e.g. prompt
editing) is explicitly out of scope for this round — can be a future backlog item once the
`role` field is actually load-bearing.

## Bootstrap: seeding the first admin

Today `home` already collects `ownerEmail`/`ownerName` when provisioning a tenant
(`server/api/admin/tenants/index.post.ts`) but doesn't forward it to `simple-ai-os`.

**Change to `home`:** `provisionSimpleAiOsTenant` (`server/utils/simpleAiOsProvisioning.ts`)
gains an `ownerEmail` field on the request body sent to `POST /api/admin/tenants`.

**Change to `simple-ai-os`:** `provisionTenant()` (`server/lib/provisionTenant.ts`) accepts an
optional `ownerEmail`. When present, after the tenant schema/migrations are set up, it writes a
`tenant_config` row:

```
key:   'pending_admin_email'
value: { email: ownerEmail.trim().toLowerCase() }
```

This reuses the existing `tenant_config` keyed-store pattern (already used for
`iam_integration`) — no schema change to `users`, no nullable `iam_sub`.

**Change to `requireTenantSession.ts`:** in the branch that creates a new `users` row on first
login (no existing row for this `iamSub`), before inserting:

1. Read `tenant_config` for key `pending_admin_email`.
2. If present and its `email` equals `session.email.trim().toLowerCase()`: insert the new user
   with `role: 'admin'`, then delete the `pending_admin_email` config row (one-shot — only the
   first matching login claims it).
3. Otherwise: insert with `role: 'member'` (unchanged behavior).

If nobody ever logs in with the matching email, the pending marker just sits there harmlessly
(same as an unclaimed invite) — no cleanup job needed, YAGNI.

Callers that don't pass `ownerEmail` (the CLI `npm run db:provision-tenant`, the backfill
script) behave exactly as today: no `pending_admin_email` row is written, and first login is
`member`. **Once at least one admin exists by any path, `/team` handles all further
promotion** — so the only remaining gap is "tenant with zero admins and no pending email,"
which is today's existing failure mode and stays a manual-DB fallback, unchanged.

## Team management: `/team` page and API

### `GET /api/team`

- Auth: `requireTenantSession(event)`, then require `user.role === 'admin'` (403 otherwise).
- Returns: `{ users: Array<{ id: string; email: string; role: 'member' | 'admin'; createdAt:
  string }> }`, ordered by `createdAt` ascending (owner/earliest first).

### `PATCH /api/team/:userId`

- Auth: same admin-only guard.
- Body: `{ role: 'member' | 'admin' }`.
- Validation:
  - 404 if `userId` doesn't exist in this tenant's `users` table.
  - 400 `"Cannot demote the last admin"` if this update would set the tenant's only remaining
    `role: 'admin'` row to `'member'` (compute by counting current admins; reject if count is 1
    and the target row is that admin and the new role is `'member'`).
  - No-op allowed (setting a member to member, or an admin to admin) — just returns the row
    unchanged, not an error.
- Returns: `{ user: { id, email, role, createdAt } }` (the updated row).

### `server/lib/team.ts`

New file holding `listTeam(db)` and `updateTeamRole(db, userId, role)` — the two functions
backing the routes above, following the same shape as `server/lib/apiKeys.ts` and
`server/lib/threads.ts` (plain functions taking a tenant-scoped `db`, not touching HTTP
concerns).

### `app/pages/team.vue`

- Table: Email | Role | Joined | Action, same `table-card`/`keys-table` styling as
  `app/pages/api-keys.vue` for visual consistency.
- Action column: a toggle button — "Promote to admin" for members, "Demote to member" for
  admins. Disabled with a tooltip/inline note when it's the last admin's demote action (mirrors
  the 400 the API would return — checked client-side from the fetched list so the button is
  disabled proactively, not just failing on click).
- Non-admin visiting directly: the page's own data fetch gets a 403; render a plain "Admins
  only" message instead of the table (no redirect — keeps it simple, matches how `api-keys.vue`
  surfaces its own errors inline).

### Nav

`app/layouts/app.vue` gains a "Team" link, rendered only when `useAuth().user.value?.role ===
'admin'` (composable already exposes `role` via `GET /api/auth/session`, no change needed
there).

## Testing

- `server/utils/requireTenantSession.test.ts`: extend the "creates new user" cases — pending
  email matches → `role: 'admin'` + config row deleted; pending email present but doesn't match
  → `role: 'member'`, config row untouched; no pending config → `role: 'member'` (existing
  case, unchanged).
- `server/lib/team.test.ts` (new): `listTeam` returns rows ordered by `createdAt`;
  `updateTeamRole` updates role; `updateTeamRole` rejects demoting the sole admin; `updateTeamRole`
  allows demoting one of two admins; 404 semantics tested at the route/e2e-api layer instead
  (lib functions can assume a valid id and let the caller 404 on empty result).
- `test/e2e-api/tenant-isolation.test.ts`-style addition (or a new `test/e2e-api/team.test.ts`):
  member gets 403 from both endpoints; admin gets 200; PATCH from admin actually persists;
  tenant isolation (an admin of tenant A can't PATCH a user in tenant B).
- `home`: extend `test/unit/simple-ai-os-provisioning.test.ts` to assert `ownerEmail` is
  included in the outgoing request body.

## Out of scope (not doing this round)

- Removing/deleting a user entirely (only role toggling).
- Inviting a new user by email before they've ever logged in (team membership is still
  "whoever completes SSO login joins as member," same as today).
- Gating anything other than `/team` itself on `role` (prompts, API keys, chat stay open to all
  members).
