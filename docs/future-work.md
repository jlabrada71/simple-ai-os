# Future work

Larger or less-defined items than `docs/backlog.md` entries — moved here when investigation
during brainstorming surfaces enough new context that the original framing needs rethinking
before it's ready to spec, but there's no immediate plan to pick it up.

## `iam` token verification (RS256/JWKS or introspection)

**Original framing (2026-08-19, superseded below)**: track when `iam` adds RS256/JWKS +
introspection so `simple-ai-os` can verify id_token signatures instead of trusting a
decoded-but-unverified token, framed as "closing a security gap in the login path."

**Investigation findings (2026-08-21)**: the original framing overstated the risk. `iam`'s own
`verifyJwt` (`server/utils/jwt.ts`, `iam` repo) is never called anywhere in production code —
not in the login exchange, not for any bearer-token check. This turns out not to be a gap in
practice: the `id_token` is handed back directly from `POST /token` over a channel already
authenticated by the app's own `client_secret` (see `iam`'s `server/routes/token.post.ts`),
not passed through any untrusted third party — so blind-trusting the decoded payload in that
specific exchange isn't the vulnerability it looks like at first glance.

**The real blocker, and why HS256 can't fix it**: `nuxt-iam-client` (running inside `home` and
`simple-ai-os`, not inside `iam` itself) has no access to `IAM_JWT_SECRET` — only `iam`'s own
server does. So "have `nuxt-iam-client` verify the signature" isn't achievable with the current
HS256 scheme without handing every consuming app the master signing secret, which would be
*worse* for security than today's authenticated-response-channel trust, not better. Any real
local verification requires switching to asymmetric signing (RS256) so consumers can verify
with a freely-published public key and never need a secret — or dropping local verification
entirely in favor of a live introspection call to `iam` per check.

**Two viable directions, not yet chosen between**:
1. **RS256 + JWKS, verified locally**: `iam` signs with a private key, publishes the public key
   at a `/.well-known/jwks.json`-style endpoint; `nuxt-iam-client` fetches and caches it, verifies
   signatures locally with no secret and no per-verification network call after the key is
   cached. Requires: keypair generation/storage in `iam`, a JWKS endpoint, `kid`-based key
   rotation support, and a JWKS-aware verifier in `nuxt-iam-client` (replacing
   `decodeJwtPayload`'s current no-op "verification").
2. **Introspection endpoint**: `nuxt-iam-client` calls a new `POST /introspect` on `iam` with the
   token on every verification. No crypto/JWKS client needed, but adds a network round-trip per
   login and makes `iam` a hard runtime dependency for every token check, not just minting.

**Why this is here and not in `docs/backlog.md`**: the original backlog item's stated
motivation didn't survive investigation, and the actual value case is now different —
enabling THIRD-PARTY services (not just the direct login response recipient) to verify a
bearer token without holding `iam`'s shared secret, e.g. a future scenario where
`simple-ai-os`'s MCP endpoint needs to verify a token presented by an external caller it never
minted. That's a real capability gap, but not an urgent one today (nothing currently needs
third-party token verification), and picking between the two directions above deserves its own
scoped brainstorming session when that need actually materializes, rather than building either
speculatively now.
