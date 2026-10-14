# MysteryBox Admin

Independent, read-only Next.js application at http://localhost:3001. Uses Tailwind CSS 4 and genuine shadcn/ui registry components backed by Radix UI.

## Run

From the repository root:

```sh
npm install
npm run dev -w @mysterybox/admin
npm run test -w @mysterybox/admin
npm run typecheck -w @mysterybox/admin
npm run build -w @mysterybox/admin
npm run start -w @mysterybox/admin
```

Start `@mysterybox/api` separately on port 4000. This application can be built and deployed separately from both the storefront and API. Root workspace dependencies include the shared body-limit and signed-proxy helpers. Use the repository as deployment context; select `apps/admin` as the application root, and install workspaces from the repository root.

## Environment

For local use, the repository-root `.env` is loaded server-side. Exported environment variables take priority.

- `API_INTERNAL_URL=http://127.0.0.1:4000`: private Nest API origin. Never expose as a `NEXT_PUBLIC_` variable.
- `PROXY_SHARED_SECRET`: same secret as the API. Production requires at least 32 characters and rejects the local demo default.
- `TRUSTED_CLIENT_IP_HEADER`: production only, `x-real-ip` or `x-vercel-forwarded-for`. Your trusted ingress must overwrite this header and provide one valid IP address.
- `ADMIN_APP_URL=http://localhost:3001`: API-side allowed origin; set to the deployed admin HTTPS origin in production.

HTTPS is required for production session cookies. No passwords, API tokens, or fake admin sessions are included. Role provisioning is an API deployment concern; the browser cannot promote itself.

## Access and API

The same-origin proxy allows only `GET /api/me`, the three admin read endpoints, and the three authentication POST endpoints. Mutation/payment routes are not proxied.

Sign-in uses `POST /api/auth/request-code {email}` followed by `POST /api/auth/verify-code {challengeId, code}`. Nest sets `mb_session` as an HttpOnly cookie, which the proxy passes through without exposing it in client state. `POST /api/auth/logout` clears it. An anonymous/expired session returns to sign-in; an authenticated non-admin receives the not-authorized screen. All authorization is enforced again by the API.

In local demo email mode, no email is sent; a development code is returned by the local API for testing. The admin UI does not persist or print this code. A real email provider must be configured for normal delivery. There is no default admin password or auth bypass.

- `GET /api/admin/summary?from=ISO&to=ISO`
- `GET /api/admin/users?from=ISO&to=ISO` (latest registrations in the window; at most 100)
- `GET /api/admin/events?from=ISO&to=ISO` (latest events in the window; at most 100)

Date inputs represent inclusive complete UTC calendar days; the API receives start-inclusive, end-exclusive timestamps, with a maximum window of 31 days. Activity is retained for 30 days. All three reports use the same window. Statistics are read directly from the first-party API; unavailable data produces an error, and empty results remain empty. Anonymous browser IDs are not people, and demo/test orders are not revenue. The UI never estimates revenue or displays raw visitor IDs, IP addresses, payment details, or secrets.

## Component provenance

Components in `components/ui` were downloaded from the official shadcn/ui `new-york-v4` registry on 2026-10-14. The only import adaptation is mapping `cn` to `@/lib/utils`, implemented with `clsx` + `tailwind-merge`; all original Radix, CVA and accessibility behavior is retained.

Official references:

- https://ui.shadcn.com/docs/installation/next
- https://ui.shadcn.com/docs/installation/manual
- https://ui.shadcn.com/r/styles/new-york-v4/button.json (and the corresponding card, badge, input, label, alert, tabs, table, skeleton registry files)
- https://nextjs.org/docs/app/api-reference/file-conventions/route

## Checks

`test/date-window.test.mjs` checks UTC boundaries, leap/invalid dates, range validation and missing timestamps. The workspace typecheck/build catches TypeScript and production bundling errors. Browser authorization and dashboard tests should run against the actual Nest API, never a bypass in application code. Isolated UI fixtures may be intercepted only in the browser test harness.

### Verification checkpoint · 2026-10-14

- Passed: five UTC date-window unit tests.
- Passed: TypeScript and independent optimized Next.js production build.
- Passed: real running Next proxy checks (unrelated endpoint rejected, admin mutation rejected, authentication body over 16 KB rejected).
- Included, not executed successfully in the current restricted runner: five Chromium UI cases covering guest/member/admin/expired access and mobile empty states. Chromium could not create its required local socket; this is an environment limitation, not a passing visual check. Run `npm run test:ui -w @mysterybox/admin` in a browser-capable development/CI environment. Optionally set `PLAYWRIGHT_EXECUTABLE_PATH` to a supported Chromium installation.
- Full OTP + Nest + Mongo end-to-end validation is a separate project integration check. The UI tests use explicit test-only intercepted fixtures; application code never supplies fake analytics or bypasses authorization.
