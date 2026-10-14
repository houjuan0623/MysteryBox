import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import {
  MAX_REQUEST_BYTES,
  readLimitedBody,
} from "@mysterybox/shared/src/body";
import { signClientIdentity } from "@mysterybox/shared/src/proxy";
import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  // 管理端只开放只读统计和登录接口，不代理订单、支付或用户修改。
  const endpoint = path.join("/");
  const allowed =
    request.method === "GET"
      ? ["admin/summary", "admin/users", "admin/events", "me"].includes(
          endpoint,
        )
      : request.method === "POST" &&
        ["auth/request-code", "auth/verify-code", "auth/logout"].includes(
          endpoint,
        );
  if (!allowed)
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "This admin endpoint is not available.",
        },
      },
      { status: 404 },
    );
  // 只代理固定 API 地址；不接受客户端提供的上游主机，避免成为开放代理。
  const base = process.env.API_INTERNAL_URL || "http://127.0.0.1:4000";
  const url = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, base);
  url.search = request.nextUrl.search;
  const headers = new Headers();
  // 生产入口必须由受信任的 ingress 覆盖指定 IP 头，不能把任意客户端 XFF 当事实。
  const secret =
    process.env.PROXY_SHARED_SECRET || "local-demo-proxy-secret-never-deploy";
  const trustedHeader = process.env.TRUSTED_CLIENT_IP_HEADER;
  let visitor = request.cookies.get("mb_visitor")?.value;
  if (!visitor || !/^[-a-zA-Z0-9]{36}$/.test(visitor)) visitor = randomUUID();
  let subject = `visitor:${visitor}`;
  if (process.env.NODE_ENV === "production") {
    if (
      !trustedHeader ||
      !["x-real-ip", "x-vercel-forwarded-for"].includes(trustedHeader) ||
      secret.length < 32 ||
      secret.startsWith("local-demo")
    )
      return NextResponse.json(
        {
          error: {
            code: "INGRESS_NOT_CONFIGURED",
            message: "The application ingress has not been configured.",
          },
        },
        { status: 503 },
      );
    const address = request.headers.get(trustedHeader)?.trim();
    if (!address || !isIP(address))
      return NextResponse.json(
        {
          error: {
            code: "INGRESS_IDENTITY_MISSING",
            message: "A verified client address is required.",
          },
        },
        { status: 403 },
      );
    subject = `ip:${address}`;
  }
  const signed = signClientIdentity(subject, secret);
  headers.set("x-mb-client", signed.payload);
  headers.set("x-mb-signature", signed.signature);

  for (const name of ["content-type", "origin", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // 只向内部 API 转发会话 cookie，不传播同源其它应用的任意 cookie。
  const session = request.cookies.get("mb_session")?.value;
  if (session)
    headers.set("cookie", `mb_session=${encodeURIComponent(session)}`);
  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    const declared = request.headers.get("content-length");
    if (declared && Number(declared) > MAX_REQUEST_BYTES)
      return NextResponse.json(
        {
          error: {
            code: "REQUEST_TOO_LARGE",
            message: "Request body must be at most 16 KB.",
          },
        },
        { status: 413 },
      );
    try {
      body = await readLimitedBody(request.body);
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "REQUEST_TOO_LARGE",
            message: "Request body must be at most 16 KB.",
          },
        },
        { status: 413 },
      );
    }
  }
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(90_000),
    });
    const outgoing = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "retry-after", "x-request-id"]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    if (process.env.NODE_ENV !== "production")
      outgoing.append(
        "set-cookie",
        `mb_visitor=${visitor}; Path=/; HttpOnly; SameSite=Lax`,
      );
    // 身份会话由 API 的 HttpOnly cookie 管理，逐条透传，不能以逗号合并 Set-Cookie。
    for (const cookie of response.headers.getSetCookie())
      outgoing.append("set-cookie", cookie);
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "API_UNAVAILABLE",
          message:
            "The administration service is unavailable. Please try again shortly.",
        },
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST };
