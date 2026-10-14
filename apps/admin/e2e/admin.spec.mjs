import { test, expect } from "@playwright/test";

// 记录脚本加载/水合失败，避免只留下停在登录检查页的模糊超时。
const browserDiagnostics = new WeakMap();
test.beforeEach(async ({ page }) => {
  const entries = [];
  browserDiagnostics.set(page, entries);
  page.on("pageerror", (error) =>
    entries.push({ kind: "pageerror", message: error.message }),
  );
  page.on("requestfailed", (request) =>
    entries.push({
      kind: "requestfailed",
      path: new URL(request.url()).pathname,
      error: request.failure()?.errorText,
    }),
  );
  page.on("response", (response) => {
    if (response.url().includes("/_next/") && response.status() >= 400)
      entries.push({
        kind: "asset-error",
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
  });
});
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus)
    await testInfo.attach("browser-diagnostics", {
      body: JSON.stringify(browserDiagnostics.get(page) ?? [], null, 2),
      contentType: "application/json",
    });
});

// 仅浏览器测试拦截 API；生产代码没有测试登录或预置统计。
const user = {
  id: "test-admin",
  email: "administrator@example.test",
  role: "admin",
  createdAt: "2026-10-12T10:00:00Z",
  lastLoginAt: "2026-10-14T09:30:00Z",
};
const summary = {
  period: {
    from: "2026-10-08T00:00:00Z",
    to: "2026-10-15T00:00:00Z",
    timezone: "UTC",
  },
  counts: {
    pageViews: 247,
    visitors: 83,
    newUsers: 12,
    activeUsers: 18,
    freeBoxes: 41,
    premiumBoxes: 4,
    demoOrders: 3,
    paidOrders: 1,
  },
  interests: [
    { interest: "creator", count: 20 },
    { interest: "developer", count: 15 },
    { interest: "student", count: 7 },
    { interest: "business", count: 3 },
  ],
  funnel: { visitors: 83, boxUsers: 35, checkoutUsers: 6 },
  notes: ["First-party activity records are retained for 30 days."],
};
async function fixtures(page, overrides = {}) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = {
      "/api/me": { user },
      "/api/admin/summary": summary,
      "/api/admin/users": { users: [user] },
      "/api/admin/events": {
        events: [
          {
            id: "fixture",
            type: "free_box",
            at: "2026-10-14T09:30:00Z",
            interest: "creator",
            mode: "demo",
          },
        ],
      },
      "/api/auth/logout": { ok: true },
      ...overrides,
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data[path] ?? {}),
    });
  });
}

test("anonymous sessions see email OTP sign-in, never report data", async ({ page }) => {
  await fixtures(page, { "/api/me": { user: null } });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByText("Anonymous browsers", { exact: true })).toHaveCount(0);
  await expect(page.locator("input[type=password]")).toHaveCount(0);
});

test("a signed-in ordinary user receives a distinct not-authorized screen", async ({
  page,
}) => {
  await fixtures(page, { "/api/me": { user: { ...user, role: "member" } } });
  await page.route("**/api/admin/**", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "Administrator access required." },
      }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "This account is not authorized" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out and switch accounts" }),
  ).toBeVisible();
  await expect(page.getByText("Page views", { exact: true })).toHaveCount(0);
});

test("admin can inspect metrics, users, events and an inclusive UTC date window", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Anonymous browsers", { exact: true })).toBeVisible();
  await expect(page.getByText("Demo / test orders", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Simulation, not actual revenue", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Users", exact: true }).click();
  await expect(page.getByRole("cell", { name: user.email })).toBeVisible();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Free Box" })).toBeVisible();
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.getByLabel("Start date, UTC").fill("2026-10-01");
  await page.getByLabel("End date, UTC, inclusive").fill("2026-10-07");
  const nextRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/admin/summary?") &&
      new URL(request.url()).searchParams.get("from") === "2026-10-01T00:00:00.000Z",
  );
  await page.getByRole("button", { name: "Apply dates" }).click();
  const request = await nextRequest;
  expect(new URL(request.url()).searchParams.get("to")).toBe("2026-10-08T00:00:00.000Z");
  await expect(page.getByText("Page views", { exact: true })).toBeVisible();
});

test("empty reports stay empty and mobile layout does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page, {
    "/api/admin/summary": {
      ...summary,
      counts: Object.fromEntries(Object.keys(summary.counts).map((key) => [key, 0])),
      interests: summary.interests.map((item) => ({ ...item, count: 0 })),
      funnel: { visitors: 0, boxUsers: 0, checkoutUsers: 0 },
    },
    "/api/admin/users": { users: [] },
    "/api/admin/events": { events: [] },
  });
  await page.goto("/");
  await expect(page.getByText("No interests recorded yet")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.getByRole("tab", { name: "Users", exact: true }).click();
  await expect(page.getByText("No matching accounts")).toBeVisible();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.getByText("A quiet window")).toBeVisible();
});

test("expired session removes access and shows sign-in", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/admin/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Sign in required." } }),
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("real proxy denies unrelated endpoints and overlarge auth bodies", async ({
  request,
}) => {
  expect((await request.get("/api/catalog")).status()).toBe(404);
  expect((await request.post("/api/admin/users", { data: {} })).status()).toBe(404);
  expect(
    (
      await request.post("/api/auth/request-code", {
        data: { email: "a".repeat(17_000) },
      })
    ).status(),
  ).toBe(413);
});
