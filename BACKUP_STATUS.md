# Current reconstruction checkpoint (work in progress)

This source snapshot was captured on 2026-10-14 at 07:57 UTC and published as an incremental development checkpoint. It is not a release, production deployment, or claim that the complete test gate passed.

The repository has three applications: Next.js Web, Next.js Admin, and the NestJS API with the official MongoDB driver. This checkpoint also includes the current internal MCP module, official Spec Kit project artifacts, lint/format configuration, tests, and a GitHub Actions verification workflow. Original source-plan.md is preserved unchanged as historical input; ADR-008 records the current architecture.

All workspace package manifests and the root lockfile were captured together and their dependency metadata matched. Credential templates contain blank values. Credentials, user data, runtime state, dependencies, build output, and raw recovery transcript copies are excluded.

Focused evidence and remaining work are recorded in docs/acceptance.md and related verification records. Historical checks and focused checks do not establish that this exact whole snapshot has passed. The full application gate, newly configured CI, and production readiness require their own verified results. Real provider calls remain outside this publication step.

README wording was adjusted only to preserve the historical-plan distinction and make the checkpoint status explicit. The active implementation remains separate and may have newer changes after capture.
