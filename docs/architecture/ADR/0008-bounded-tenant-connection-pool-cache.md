# ADR-0008: Bound the per-tenant connection pool cache with LRU eviction

## Status

Accepted (2026-08-21)

## Context

`getTenantDb(schemaName)` (`server/db/client.ts`) caches one dedicated connection pool per
tenant schema in a plain `Map`, forever — nothing ever closed or evicted an entry, and each
pool defaulted to the driver's own `max` (10 connections). `home` has the identical pattern
(its own copy explicitly says "Mirrors web/home's server/db/client.ts"), and both apps run as
a single long-lived Node process (default Nitro `node-server` preset — no serverless cold
starts to naturally bound a process's lifetime tenant count).

This surfaced as flaky e2e-api test failures in `home`
(`PostgresError: sorry, too many clients already`) once a test run touched enough distinct
tenant schemas in parallel to transiently exceed Postgres's `max_connections` (100 by default).
The same failure mode applies in production: any long-running process that ends up serving
enough distinct tenants over its lifetime accumulates unbounded connections with no cap.

## Decision

Cap the cache at 20 tenant pools with LRU eviction (a `Map`'s insertion order gives LRU
ordering for free via delete-then-reinsert on every touch), and reduce each pool's own `max`
connections from the driver default (10) to 3. Worst case: `20 × 3 = 60` connections from
tenant traffic, leaving headroom under `max_connections: 100` alongside `publicDb`'s own pool
and other processes on the same instance.

Rejected alternative: an idle-timeout sweep (close pools unused for N minutes) instead of a
hard cap on pool *count*. Rejected because it doesn't bound the *transient* spike that caused
the original failure — a burst of traffic (or a test run) touching many distinct tenants within
the idle window still opens that many pools before any sweep fires. A hard cap, evicting the
least-recently-used pool whenever a new tenant would exceed it, bounds worst-case connections
regardless of traffic pattern.

Rejected alternative: replacing per-tenant pools with a single shared pool and per-query
`SET search_path`. This would remove the leak class entirely, but is a materially larger,
riskier change (affects every query path's connection-checkout semantics) than fixing the
specific unbounded-growth bug. Not needed to close this issue; revisit only if the per-tenant-
pool pattern itself becomes a problem for other reasons.

## Consequences

- Both `home` and `simple-ai-os` now have an identical, small, hand-rolled LRU implementation
  in their respective `server/db/client.ts` — no new dependency.
- The cap (20) and per-pool `max` (3) are hardcoded constants, not env-configurable. If real
  traffic data later shows these numbers are wrong for either app, they're two one-line changes
  to `TENANT_POOL_CACHE_SIZE`/`TENANT_POOL_MAX_CONNECTIONS` in each file — not a redesign.
- Evicting a pool while a request has an in-flight query against it is safe: both drivers'
  `.end()` are graceful (`postgres-js`'s waits up to a configured timeout; `pg`'s already waits
  for checked-out clients) — only *new* checkouts against an evicted schema are refused, and the
  next `getTenantDb` call for that schema transparently reopens a fresh pool.
