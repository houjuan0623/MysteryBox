# Scoped MCP inside the existing API

This module exposes a genuine MCP Streamable HTTP endpoint at `/mcp` in the existing NestJS API. It uses the official `@modelcontextprotocol/sdk` 1.32.1. There is no fourth app, background agent, scheduler, OAuth registration, automatic key creation, or provider call.

## Safe default and integration

`MCP_ENABLED=0` (or unset) registers no route. Public demo deployments must leave it disabled. In API bootstrap, call `attachMcp(app, { store, analytics })` before the general JSON parser and cookie/origin middleware. The module has its own 16 KiB JSON parser and independent bearer authentication. It does not accept website cookies or admin sessions.

Operator configuration, only after approving and provisioning a dedicated credential outside this module:

- `MCP_ENABLED=1`
- `MCP_TOKEN_SHA256`: 64-character SHA-256 digest of the dedicated bearer token. Keep the token outside source, files, logs and frontend configuration. Token must have at least 32 URL-safe bearer characters; use high-entropy credentials. This module verifies the digest in constant time and never issues credentials.
- `MCP_PRINCIPAL_ID`: opaque operator-chosen identifier (letters, numbers, `.`, `_`, `-`, maximum 64).
- `MCP_SCOPES`: comma-separated subset of `analytics:read,drafts:read,drafts:write`; no implicit scopes.
- `MCP_ALLOW_REMOTE=0`: default. Requires loopback socket, loopback Host, and no forwarded headers. Keep public reverse proxies from routing `/mcp` to this API.
- `MCP_ALLOWED_HOSTS`: exact hostnames, no ports, wildcards or URLs. Default `localhost,127.0.0.1,[::1]`. A remote deployment requires an explicit host list and `MCP_ALLOW_REMOTE=1`, TLS at a trusted ingress, and independent ingress rate limiting.
- `MCP_ALLOWED_ORIGINS`: exact comma-separated browser origins. Default empty rejects every request that supplies Origin. Origin-less native MCP clients are permitted with valid bearer authentication. Non-loopback origins require HTTPS.

These are configuration descriptions only. No deploy, secret, persistent account, OAuth grant, Codex installation, or client registration is performed by this module. It is a preconfigured bearer integration, not a full OAuth discovery/authorization service.

## Tools and boundaries

- `analytics_summary` (`analytics:read`): aggregate counts, interest totals and funnel within a valid UTC window of at most 31 days. No raw users, email, activity rows or payment identities.
- `draft_create` (`drafts:write`): private unpublished draft of type `tool`, `box`, or `promotion`. Strict fields: title (1–120), content (1–8000), tags (at most 8 × 32), required idempotencyKey (8–128). Unknown keys are rejected; status always `draft`. At most 1000 drafts per identity.
- `draft_list` (`drafts:read`): only the authenticated identity's drafts, optional type filter and UUID cursor, limit 1–50.

Only in-scope tools appear in `tools/list`. Calls still check scope independently. There are no publish, shell, arbitrary database, refund, payment, user-export, model, email or promotion-delivery tools. Draft text is untrusted and inert; downstream human review is required.

Draft write, hashed idempotency receipt and success audit are atomic in the existing Store. Same principal + key + normalized payload replays the original draft; a different payload conflicts. Changing the principal creates a separate private draft namespace. Keep the principal stable during token rotation to preserve access. Credentials may be revoked by disabling the endpoint or replacing the digest and restarting. Existing auth is one configured principal per API process.

Audits store only generated ID/time, opaque principal, generated request ID, fixed action/outcome/error code, and optional draft ID. No request bodies, bearer values, draft content, IPs, personal emails or remote error text are logged. Audit failure prevents success; successful draft creation cannot commit without its audit. Storage has no automatic audit retention yet; establish operational retention before broad use. A per-process 120-request/minute guard uses two fixed buckets, authorized and anonymous; it is not a distributed rate limiter.

## Verification

Verification on 2026-10-14: all 13 new scoped MCP tests passed, with 0 failures and 0 skips. API TypeScript checking and scoped ESLint also passed. An independent read-only reviewer reran the earlier 12-test set and found no confirmed MCP authorization, scope or draft-isolation issue. The final additional test starts the actual existing Nest API and checks MCP routing plus ordinary API origin protection.

Run from repository root: `node --import tsx --test apps/api/src/mcp/mcp.test.ts`, `node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json`, and `node_modules/.bin/eslint apps/api/src/mcp`.

The scoped MCP tests use ephemeral synthetic credentials held only in memory and local HTTP. They cover real SDK initialization, tool discovery/calls, identity isolation, strict validation, idempotency/concurrency, safe errors and audit behavior. They do not claim provider, production-credential, remote-deployment, or previous-version tests as proof of this feature.

Official references checked for this implementation:

- https://ts.sdk.modelcontextprotocol.io/server
- https://github.com/modelcontextprotocol/typescript-sdk
- https://www.npmjs.com/package/@modelcontextprotocol/sdk
