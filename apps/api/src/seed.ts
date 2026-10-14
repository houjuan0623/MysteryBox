import { readConfig } from "./config";
import { catalog, CATALOG_VERSION } from "./catalog";
import { MongoStore } from "./store";
/** 仅幂等 upsert 公开工具目录，不覆盖订单、账户或收藏。 */
async function main() {
  const c = readConfig();
  if (!c.mongoUrl) throw new Error("MONGODB_URI is required for seed");
  const store = MongoStore.fromUrl(c.mongoUrl, c.mongoDb);
  try {
    await store.ready();
    await store.atomic("catalog:seed", async (tx) => {
      for (const tool of catalog) await tx.put("tools", tool.id, tool);
      await tx.put("catalog_versions", "current", { version: CATALOG_VERSION });
    });
    console.log(`Seeded ${catalog.length} public tools; version ${CATALOG_VERSION}.`);
  } finally {
    await store.close();
  }
}
main().catch(() => {
  console.error("Seed failed; check database configuration and migration.");
  process.exitCode = 1;
});
