# Design: surface `simple-ai-os` provisioning status in `home`'s Tenants admin UI

## Context

`POST /api/admin/tenants` (`web/home`) already reports `simpleAiOsProvisioned: true/false` at
tenant-creation time, but the value is never persisted — `GET /api/admin/tenants` (the list an
admin actually looks at) has no way to know, for an already-created tenant, whether it has a
working `simple-ai-os` space, short of checking server logs or speculatively re-running
`npm run db:backfill-simple-ai-os-tenant`. This is the item added to `home/docs/backlog.md`
during the cross-app-provisioning phase.

## Decisions

1. **Persist a `simpleAiOsProvisionedAt` (nullable `timestamptz`) column on `public.tenants`**
   rather than querying `simple-ai-os` live on every list-page load — cheap, fast, and doesn't
   couple the admin list page's availability to `simple-ai-os`'s.
2. **Set it wherever provisioning already succeeds**: `POST /api/admin/tenants` (creation) and
   `server/db/scripts/backfill-simple-ai-os-tenant.ts` (the existing retry script) both update
   this column when `provisionSimpleAiOsTenant(...)` returns `ok: true`.
3. **New per-tenant retry endpoint**: `POST /api/admin/tenants/:slug/retry-simple-ai-os`
   (admin-session-gated, same guard as every other admin tenants endpoint) — calls
   `provisionSimpleAiOsTenant` for just that one tenant and updates the column on success. This
   is what a UI retry action calls; it doesn't replace the bulk backfill script, which stays for
   fixing many tenants at once outside the UI.
4. **UI**: `GET /api/admin/tenants` returns the new column; `app/pages/admin/tenants/index.vue`
   shows a status badge per row — a provisioned indicator with the date when set, or a warning
   indicator with a **Retry** button (calling decision 3's endpoint, then refreshing the list)
   when `null`.

## Testing

- Extend the existing real-server e2e-api test (`test/e2e-api/admin-tenants-api.test.ts`, which
  already has a fake `simple-ai-os` stand-in from the cross-app-provisioning work) to assert:
  `simpleAiOsProvisionedAt` is set after a successful creation, stays `null` after a failed one,
  and the new retry endpoint sets it on a subsequent successful call.

## Out of scope

- Any change to the bulk `db:backfill-simple-ai-os-tenant` script's own behavior beyond also
  persisting the column.
- Any UI in `simple-ai-os` itself (this is entirely `home`-side).
