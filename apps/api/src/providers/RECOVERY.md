# Provider restoration provenance

Reconstructed on 2026-10-14 from original implementation source text retained in the worker conversation. These are reconstructed source files, not recovered Git objects. Formatting and comments have been normalized in places. Original adapters passed 23 focused tests before the old host was replaced; that historical result does not establish that this restoration passes until tests are rerun. No real keys or provider requests were used. The live approval gate stays closed. Later model approvals or parent edits not present in the retained source are not inferred.

The final PayPal verifyWebhook method was restored from the retained e4263f7 audit excerpt in recovery-reference/paypal.e4263f7.L460-L534.partial.ts. The optional rawBody interface parameter was re-added as restoration integration.

Restoration integration: scripts/live-smoke.ts supplies the newly required Config.proxySecret as a random in-memory value. This was absent from the earlier worker source but is required by the newer recovered core contract. All network gates remain closed.

Restoration integration: the parent replaced persistence with MongoDB. Optional smoke configuration now includes mongoDb while the service smoke uses MemoryStore; the UI wrapper sets an empty MONGODB_URI to prevent real database connections.

## Restoration verification

2026-10-14 07:09 UTC: 33 focused provider and budget tests passed before and after formatting; API TypeScript and standalone smoke TypeScript checks passed; shell syntax passed. Blocked live preflight returned the expected failure before credential access or network. No real provider requests were made.
