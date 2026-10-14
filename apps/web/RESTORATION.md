# Reconstructed frontend source

This frontend was reconstructed on 2026-10-14 from source-writing commands retained in the original implementation conversation after the host filesystem disappeared. It is not a recovery of original Git objects or an assertion that the original filesystem survived.

The retained commands contain the implemented routes, styles, components, client state helpers, unit tests, E2E tests, and follow-up fixes. Formatting can differ from the lost Prettier-formatted files. Verification performed on the original host does not establish verification of this reconstructed copy; this copy must be checked again.

## Newly requested enhancement after the faithful checkpoint

The user subsequently asked for smooth frontend motion. `components/motion-frame.tsx`, its layout wrapper, loading-scene inserts, copy feedback class, and the final motion section of `app/globals.css` are new additions, not claims about the lost original source. They add short route/content entrances, limited decorative floating, box-opening request feedback, and favorite/copy feedback. Motion uses transform/opacity, adds no animation dependency, does not delay requests, reduces decorative work on small screens, and respects prefers-reduced-motion.

## Newly requested shadcn/ui and Tailwind CSS stack

After the faithful checkpoint, the user required actual shadcn/ui and Tailwind CSS. The current copy uses Tailwind CSS 4 with its official PostCSS plugin, semantic theme tokens, a components.json registry configuration, and genuine shadcn/ui Radix components downloaded from the official new-york-v4 registry. The original downloaded registry JSON and SHA-256 hashes are preserved under vendor/shadcn with the upstream MIT license. These are newly adopted upstream components, not reconstructed original application code.

Official setup references:
- https://ui.shadcn.com/docs/installation/next
- https://ui.shadcn.com/docs/installation/manual
- https://ui.shadcn.com/docs/components/radix/button
- https://tailwindcss.com/docs/installation/framework-guides/nextjs

Application buttons, links styled as buttons, cards, text inputs, textareas, alerts, badges, and the email-consent checkbox use the actual components. Custom art/layout styles remain in a Tailwind component layer; Tailwind utilities control primitive variants, sizing, spacing, color tokens, and responsive adjustments.

## Newly requested first-party usage analytics

The frontend now optionally sends coarse page-view events for `/`, `/discover`, `/box`, and `/account`, plus a random session-only visitor header on existing API requests. It honors Do Not Track, omits query strings and form values from activity payloads, and provides a working opt-out checkbox on the privacy page. This is a new feature requested after reconstruction; backend validation, hashing, retention, and access control are owned by the API.

## Verification of the reconstructed and enhanced copy

On 2026-10-14, after the shadcn/Tailwind, motion, and optional analytics additions: frontend TypeScript checking passed, all 12 frontend unit tests passed, and the Next.js production build passed. Eight browser E2E cases are included, but this note does not claim they were executed on this host.
