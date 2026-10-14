import { createHash } from "node:crypto";
import { readConfig } from "./config";
import { MongoStore } from "./store";
import type { User } from "../../../packages/shared/src";
/** 仅本地运维命令。必须先通过邮箱验证创建账户；不生成密码、密钥或公共管理员。 */
async function main() {
  const [action, email] = process.argv.slice(2);
  if (!["grant", "revoke"].includes(action || "") || !email || !email.includes("@"))
    throw new Error("Usage: admin:role -- grant|revoke verified-email");
  const c = readConfig();
  if (!c.mongoUrl)
    throw new Error(
      "MongoDB is required; role bootstrap is not available for the ephemeral demo store.",
    );
  const store = MongoStore.fromUrl(c.mongoUrl, c.mongoDb);
  try {
    await store.ready();
    const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
    await store.atomic(`user-email:${hash}`, async (tx) => {
      const index = await tx.get<{ id: string }>("user_emails", hash);
      const user = index ? await tx.get<User>("users", index.id) : undefined;
      if (!user) throw new Error("The account must sign in and verify its email first.");
      user.role = action === "grant" ? "admin" : "member";
      await tx.put("users", user.id, user);
    });
    console.log(
      "Role updated. Existing sessions use the new role on their next request.",
    );
  } finally {
    await store.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Role update failed.");
  process.exitCode = 1;
});
