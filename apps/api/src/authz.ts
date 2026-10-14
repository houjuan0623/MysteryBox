import type { User } from "../../../packages/shared/src";
import { AppError } from "./domain";
/** 每次从服务端会话读取当前用户角色；前端隐藏按钮不是授权边界。 */
export function requireAdmin(user: User | undefined): User {
  if (!user) throw new AppError(401, "AUTH_REQUIRED", "Please sign in to continue.");
  if (user.role !== "admin")
    throw new AppError(
      403,
      "ADMIN_REQUIRED",
      "This account does not have administrator access.",
    );
  return user;
}
