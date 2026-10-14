/** 仅供 Web/API 服务端导入。浏览器不能选择限流身份或生成代理签名。 */
import { createHmac, timingSafeEqual } from "node:crypto";
export function signClientIdentity(
  subject: string,
  secret: string,
  timestamp = Date.now(),
) {
  const payload = Buffer.from(JSON.stringify({ subject, timestamp })).toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return { payload, signature };
}
export function verifyClientIdentity(
  payload: string | undefined,
  signature: string | undefined,
  secret: string,
  now = Date.now(),
): string | undefined {
  if (
    !payload ||
    !signature ||
    payload.length > 512 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return;
  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { subject: unknown; timestamp: unknown };
    if (
      typeof value.subject !== "string" ||
      value.subject.length > 200 ||
      !/^(?:ip|visitor):[a-zA-Z0-9:.\-]+$/.test(value.subject) ||
      typeof value.timestamp !== "number" ||
      !Number.isSafeInteger(value.timestamp) ||
      Math.abs(now - value.timestamp) > 60000
    )
      return;
    return value.subject;
  } catch {
    return;
  }
}
