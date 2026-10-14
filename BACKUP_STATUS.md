# In-progress reconstruction backup

This branch is a source-preservation checkpoint captured on 2026-10-14 at 07:29 UTC. It is not a release, production deployment, or claim that complete integration checks passed. The active implementation continues separately.

The snapshot contains the current web, API, admin, shared-package, documentation, and script files. Package manifests and the root lockfile were captured together and their dependency metadata matched. Blank local environment templates and two screened admin verification logs are included. Credentials, user data, runtime state, dependencies, build output, and raw recovery transcript copies are excluded.

The existing documentation distinguishes historical checks from current focused checks. Full API/MongoDB/browser/integration acceptance remains pending; this backup action did not run tests. The root build script currently omits the admin build, and the HTTP-check script it references has not yet been reconstructed. The README still contains an older PostgreSQL label; the current database direction is documented as MongoDB. These in-progress issues were preserved rather than silently changing active source.

Do not treat this checkpoint as deployable or merge it over newer work without reviewing the changes.
