import "reflect-metadata";
import { verifyClientIdentity } from "../../../packages/shared/src/proxy";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpCode,
  HttpException,
  Module,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { json, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import {
  briefSchema,
  INTERESTS,
  type User,
} from "../../../packages/shared/src";
import { catalog, CATALOG_VERSION } from "./catalog";
import { publicConfig, readConfig } from "./config";
import { AppError, MysteryBoxService } from "./domain";
import { MemoryStore, MongoStore } from "./store";
import { createProviders } from "./providers";
import { createGuardedFetch, LIVE_MODEL } from "./providers/test-budget";

const config = readConfig();
const store = config.mongoUrl
  ? MongoStore.fromUrl(config.mongoUrl, config.mongoDb)
  : new MemoryStore();
const liveGuard =
  process.env.APP_LIVE_TEST === "1" ? createGuardedFetch() : undefined;
if (
  liveGuard &&
  (config.aiMode !== "vercel" ||
    config.gatewayModel !== LIVE_MODEL ||
    config.paymentMode !== "demo" ||
    config.emailMode !== "demo")
)
  throw new Error("Live test configuration rejected");
const service = new MysteryBoxService(
  config,
  store,
  liveGuard ? createProviders(config, liveGuard.fetch) : undefined,
);
const cookieName = "mb_session";
function rateSubject(req: Request) {
  const verified = verifyClientIdentity(
    req.get("x-mb-client"),
    req.get("x-mb-signature"),
    config.proxySecret,
  );
  if (verified) return verified;
  if (config.production)
    throw new AppError(
      403,
      "PROXY_IDENTITY_REQUIRED",
      "Request must pass through the configured application ingress.",
    );
  return req.ip || "unknown";
}

function session(req: Request) {
  const item = req.headers.cookie
    ?.split(";")
    .find((c) => c.trim().startsWith(`${cookieName}=`));
  return item?.trim().slice(cookieName.length + 1);
}
function header(req: Request, name: string) {
  const value = req.get(name);
  return value?.slice(0, 256);
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      400,
      "INVALID_INPUT",
      result.error.issues
        .map((i) => i.message)
        .slice(0, 3)
        .join(" "),
    );
  return result.data;
}
async function user(req: Request, required = false) {
  const result = await service.userFromSession(session(req));
  if (required && !result)
    throw new AppError(401, "AUTH_REQUIRED", "Please sign in to continue.");
  return result;
}
const emailSchema = z.object({ email: z.email().max(254) }).strict();

@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const id = String(response.getHeader("X-Request-Id") || "");
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof HttpException
          ? error.getStatus()
          : 503;
    const code =
      error instanceof AppError
        ? error.code
        : status === 404
          ? "NOT_FOUND"
          : "SERVICE_UNAVAILABLE";
    const message =
      error instanceof AppError
        ? error.message
        : status === 404
          ? "Endpoint not found."
          : "This service is temporarily unavailable. Your existing payment or request can be safely retried.";
    // 不记录请求体、邮箱、授权头、模型输入或上游错误正文。
    if (status >= 500)
      console.error(
        JSON.stringify({
          level: "error",
          requestId: id,
          code,
          event: "request_failed",
        }),
      );
    response.status(status).json({ error: { code, message, requestId: id } });
  }
}

@Controller()
class ApiController {
  @Get("health") async health() {
    await store.ready();
    return { ok: true, storage: store.mode, demo: publicConfig(config).demo };
  }
  @Get("config") config() {
    return publicConfig(config);
  }
  @Get("catalog") catalog(
    @Query("interest") interest?: string,
    @Query("q") query?: string,
  ) {
    if (interest && !INTERESTS.includes(interest as (typeof INTERESTS)[number]))
      throw new AppError(
        400,
        "INVALID_INTEREST",
        "Choose a supported interest.",
      );
    const q = (query || "").slice(0, 100).toLowerCase();
    return {
      catalogVersion: service.catalogVersion,
      tools: service.catalog.filter(
        (t) =>
          (!interest ||
            t.interests.includes(interest as (typeof INTERESTS)[number])) &&
          (!q ||
            `${t.name} ${t.tagline} ${t.description}`
              .toLowerCase()
              .includes(q)),
      ),
    };
  }
  @Post("boxes/free") @HttpCode(200) async free(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const brief = parse(briefSchema, body),
      current = await user(req);
    await service.limit(
      "free",
      current?.id || rateSubject(req),
      config.freeLimit,
      86400000,
    );
    return service.free(brief, header(req, "Idempotency-Key") || "", current);
  }
  @Get("boxes/:id") async box(@Param("id") id: string, @Req() req: Request) {
    return {
      box: await service.readBox(
        id,
        header(req, "X-Box-Token"),
        await user(req),
      ),
    };
  }
  @Post("boxes/:id/email") @HttpCode(200) async emailBox(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const input = parse(
      z
        .object({ email: z.email().max(254), consent: z.literal(true) })
        .strict(),
      body,
    );
    await service.limit("box-email", rateSubject(req), 10, 3600000);
    return service.emailBox(
      id,
      input.email,
      header(req, "X-Box-Token"),
      await user(req),
    );
  }
  @Post("checkout/orders") @HttpCode(200) async createOrder(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const brief = parse(briefSchema, body);
    await service.limit("checkout", rateSubject(req), 20, 3600000);
    return service.createOrder(
      brief,
      header(req, "Idempotency-Key") || "",
      await user(req),
    );
  }
  @Get("checkout/orders/:id") async order(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    return service.orderStatus(
      id,
      header(req, "X-Order-Token"),
      await user(req),
    );
  }
  @Post("checkout/orders/:id/capture") @HttpCode(200) async capture(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    parse(z.object({}).strict(), body);
    await service.limit("capture", rateSubject(req), 50, 3600000);
    return service.captureOrder(
      id,
      header(req, "X-Order-Token"),
      await user(req),
    );
  }
  @Post("checkout/orders/:id/demo-complete") @HttpCode(200) async demoCapture(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    parse(z.object({}).strict(), body);
    await service.limit("capture", rateSubject(req), 50, 3600000);
    return service.captureOrder(
      id,
      header(req, "X-Order-Token"),
      await user(req),
      true,
    );
  }
  @Post("webhooks/paypal") @HttpCode(202) async webhook(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const headers = Object.fromEntries(
      [
        "paypal-auth-algo",
        "paypal-cert-url",
        "paypal-transmission-id",
        "paypal-transmission-sig",
        "paypal-transmission-time",
      ].map((name) => [name, req.get(name)]),
    );
    return service.webhook(headers, body, (req as Request & { rawBody?: string }).rawBody);
  }
  @Post("auth/request-code") @HttpCode(200) async requestCode(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const input = parse(emailSchema, body);
    await service.limit("login-ip", rateSubject(req), 20, 3600000);
    return service.requestCode(input.email);
  }
  @Post("auth/verify-code") @HttpCode(200) async verify(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(
      z
        .object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) })
        .strict(),
      body,
    );
    const result = await service.verifyCode(input.challengeId, input.code);
    res.cookie(cookieName, result.token, {
      httpOnly: true,
      secure: config.production,
      sameSite: "lax",
      maxAge: 7 * 86400000,
      path: "/api",
    });
    return { user: result.user };
  }
  @Get("auth/me") async me(@Req() req: Request) {
    return { user: (await user(req)) || null };
  }
  @Post("auth/logout") @HttpCode(200) async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await service.logout(session(req));
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: config.production,
      sameSite: "lax",
      path: "/api",
    });
    return { ok: true };
  }
  @Get("me/boxes") async history(@Req() req: Request) {
    return { boxes: await service.history((await user(req, true))!) };
  }
  @Get("me/favorites") async favorites(@Req() req: Request) {
    return { toolIds: await service.favorites((await user(req, true))!) };
  }
  @Put("me/favorites/:toolId") async favorite(
    @Param("toolId") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const input = parse(z.object({ saved: z.boolean() }).strict(), body);
    return service.favorite((await user(req, true))!, id, input.saved);
  }
  @Post("me/claim-box") @HttpCode(200) async claim(
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const input = parse(
      z.object({ boxId: z.uuid(), accessToken: z.string().max(128) }).strict(),
      body,
    );
    return service.claim(
      input.boxId,
      input.accessToken,
      (await user(req, true))!,
    );
  }
}
@Module({ controllers: [ApiController] })
class AppModule {}

export async function start() {
  await store.ready();
  await service.loadCatalog();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: ["error", "warn"],
  });
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new Errors());
  app.use(helmet());
  app.use(
    json({
      limit: "16kb",
      verify: (req, _res, buffer) => {
        (req as Request & { rawBody?: string }).rawBody =
          buffer.toString("utf8");
      },
    }),
  );

  app.enableCors({
    origin: config.appUrl,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Idempotency-Key",
      "X-Box-Token",
      "X-Order-Token",
    ],
    methods: ["GET", "POST", "PUT", "OPTIONS"],
  });
  app.use((req: Request, res: Response, next: () => void) => {
    res.setHeader("X-Request-Id", randomUUID());
    res.setHeader("Cache-Control", "no-store");
    // same-origin cookie 防护。webhook 走独立签名校验；拒绝其他来源的变更请求。
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.path !== "/api/webhooks/paypal" &&
      req.get("origin") !== config.appUrl
    ) {
      res
        .status(403)
        .json({
          error: {
            code: "ORIGIN_REJECTED",
            message: "This request must come from the application origin.",
          },
        });
      return;
    }
    next();
  });
  await app.listen(config.port, "0.0.0.0");
  console.log(
    JSON.stringify({
      event: "api_ready",
      port: config.port,
      storage: store.mode,
      modes: {
        ai: config.aiMode,
        payment: config.paymentMode,
        email: config.emailMode,
      },
    }),
  );
  let processing = false;
  const timer = setInterval(async () => {
    if (processing) return;
    processing = true;
    try {
      await service.processEvents();
    } catch {
      console.error('{"event":"webhook_worker_failed"}');
    } finally {
      processing = false;
    }
  }, 5000);
  timer.unref();
  const stop = async () => {
    clearInterval(timer);
    await app.close();
    await store.close();
    liveGuard?.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
  return app;
}
if (require.main === module)
  start().catch(() => {
    console.error(
      "API startup failed. Check required configuration and database migration.",
    );
    process.exitCode = 1;
  });
