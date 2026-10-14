import "reflect-metadata";
import { attachMcp } from "./mcp";
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
} from "../../../packages/shared/src";
import { publicConfig, readConfig } from "./config";
import { requireAdmin } from "./authz";
import { createHash } from "node:crypto";
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
// 统计失败不能把已完成的支付/生成变成错误；仅记录无敏感字段的运维事件。
async function activity(event:Parameters<typeof service.analytics.record>[0]) {if(!event.visitorId)return; const {userId:_userId,...optionalEvent}=event; try{await service.analytics.record(optionalEvent);}catch{console.error('{"event":"analytics_record_failed"}');}}
function period(from?:string,to?:string) {try{return service.analytics.period(from,to);}catch{throw new AppError(400,"INVALID_PERIOD","Choose a valid UTC period up to 31 days.");}}
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

  @Post("activity") @HttpCode(202) async pageView(@Body() body:unknown,@Req() req:Request) {
    const input=parse(z.object({eventId:z.uuid(),visitorId:z.uuid(),path:z.enum(["/","/discover","/box","/account"])}).strict(),body);
    await service.limit("activity",rateSubject(req),200,3600000);
    await activity({id:`page:${input.eventId}`,type:"page_view",path:input.path,visitorId:input.visitorId});
    return {accepted:true};
  }
  @Get("admin/summary") async summary(@Req() req:Request,@Query("from") from?:string,@Query("to") to?:string) {
    requireAdmin(await user(req));return service.analytics.summary(period(from,to));
  }
  @Get("admin/users") async adminUsers(@Req() req:Request,@Query("from") from?:string,@Query("to") to?:string) {
    requireAdmin(await user(req));return {users:await service.analytics.users(period(from,to))};
  }
  @Get("admin/events") async adminEvents(@Req() req:Request,@Query("from") from?:string,@Query("to") to?:string) {
    requireAdmin(await user(req));return {events:(await service.analytics.events(period(from,to))).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,100).map(({id,type,at,interest,mode,paymentEnvironment})=>({id,type,at,interest,mode,paymentEnvironment}))};
  }
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
    const result = await service.free(brief, header(req, "Idempotency-Key") || "", current);
    await activity({id:`free:${result.box.id}`,type:"free_box",interest:brief.interest,userId:current?.id,visitorId:header(req,"x-analytics-visitor")});
    return result;
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
    const current=await user(req);
    const result=await service.createOrder(brief,header(req,"Idempotency-Key")||"",current);
    await activity({id:`checkout:${result.orderId}`,type:"checkout",interest:brief.interest,userId:current?.id,visitorId:header(req,"x-analytics-visitor"),mode:config.paymentMode,paymentEnvironment:config.paymentMode==="demo"?"demo":config.paypalMode});
    return result;
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
    const current=await user(req);
    const result=await service.captureOrder(id,header(req,"X-Order-Token"),current,false);
    await activity({id:`premium:${result.box.id}`,type:"premium_box",interest:result.box.interest,userId:current?.id,visitorId:header(req,"x-analytics-visitor"),mode:config.paymentMode,paymentEnvironment:config.paymentMode==="demo"?"demo":config.paypalMode});
    return result;
  }
  @Post("checkout/orders/:id/demo-complete") @HttpCode(200) async demoCapture(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    parse(z.object({}).strict(), body);
    await service.limit("capture", rateSubject(req), 50, 3600000);
    const current=await user(req);
    const result=await service.captureOrder(id,header(req,"X-Order-Token"),current,true);
    await activity({id:`premium:${result.box.id}`,type:"premium_box",interest:result.box.interest,userId:current?.id,visitorId:header(req,"x-analytics-visitor"),mode:config.paymentMode,paymentEnvironment:config.paymentMode==="demo"?"demo":config.paypalMode});
    return result;
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
    @Req() req: Request,
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
    await activity({id:`login:${createHash("sha256").update(result.token).digest("hex")}`,type:"login",userId:result.user.id,visitorId:header(req,"x-analytics-visitor")});
    return { user: result.user };
  }
  @Get(["auth/me", "me"]) async me(@Req() req: Request) {
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
  attachMcp(app, { store, analytics: service.analytics });
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
    origin: [config.appUrl, config.adminAppUrl],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Idempotency-Key",
      "X-Box-Token",
      "X-Order-Token",
      "X-Analytics-Visitor",
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
      ![config.appUrl, config.adminAppUrl].includes(req.get("origin") || "")
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
  let lastPrune = 0;
  const timer = setInterval(async () => {
    if (processing) return;
    processing = true;
    try {
      await service.processEvents();
      if(Date.now()-lastPrune>3600000){await service.analytics.prune();lastPrune=Date.now();}
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
