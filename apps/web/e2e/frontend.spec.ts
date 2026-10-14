import { test, expect, type Page } from "@playwright/test";
// 这些浏览器测试只允许访问本地全模拟环境，避免测试误触真实模型、邮件或支付服务。
test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/config");
  expect(response.ok()).toBeTruthy();
  const config = await response.json();
  test.skip(
    config.aiMode !== "demo" ||
      config.emailMode !== "demo" ||
      config.paymentMode !== "demo",
    "End-to-end tests require all three demo providers.",
  );
});
async function openFreeBox(page: Page) {
  await page.goto("/discover?interest=developer");
  await expect(page.getByRole("radio", { name: "Developer", exact: true })).toBeChecked();
  await page
    .getByRole("textbox", { name: /What would you like to do/ })
    .fill("Build a small, useful side project");
  await page.getByRole("button", { name: "Open my free box", exact: true }).click();
  await expect(page).toHaveURL(/\/box\/[^/?]+$/);
  await expect(page.locator(".recommendation")).toHaveCount(1);
}
test("free discovery has a prompt, official link, steps, and survives refresh", async ({
  page,
}) => {
  await openFreeBox(page);
  await expect(
    page.getByRole("button", { name: "Copy prompt", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.recommendation a[target="_blank"]').first(),
  ).toHaveAttribute("href", /^https:\/\//);
  await expect(page.locator(".use-steps ol li").first()).toBeVisible();
  const boxUrl = page.url();
  await page.reload();
  await expect(page.locator(".recommendation")).toHaveCount(1);
  expect(page.url()).toBe(boxUrl);
  await expect(
    page.getByRole("checkbox", { name: /Send this box to the email above/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Send my box", exact: true }),
  ).toBeDisabled();
});
test("premium demo needs explicit completion and returns three tools with a workflow", async ({
  page,
}) => {
  await page.goto("/discover?interest=business&tier=premium");
  await page.getByRole("button", { name: "Try premium demo", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\/return\?order=/);
  await expect(
    page.getByText("This is a simulated payment.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open demo premium box", exact: true }).click();
  await expect(page).toHaveURL(/\/box\/[^/?]+$/);
  await expect(page.locator(".recommendation")).toHaveCount(3);
  await expect(page.locator(".workflow-steps li").first()).toBeVisible();
});
test("demo sign-in claims a browser box and persists a favorite in the collection", async ({
  page,
}) => {
  await openFreeBox(page);
  await page.goto("/account");
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill(`ui-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`);
  await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
  const code = page.locator(".demo-code b");
  await expect(code).toBeVisible();
  await page
    .getByRole("textbox", { name: "One-time code", exact: true })
    .fill((await code.textContent())!.trim());
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your collection.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".history-card")).toHaveCount(1);
  await page.locator(".history-card").first().click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  await page.goto("/account");
  await page.getByRole("tab", { name: /Favorite tools/ }).click();
  await expect(page.locator(".tool-card")).toHaveCount(1);
  await page.getByRole("button", { name: /Remove .+ from favorites/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Keep the ones that catch your eye.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Send sign-in code", exact: true }),
  ).toBeVisible();
});
test("catalog search has useful empty and reset states", async ({ page }) => {
  await page.goto("/discover#catalog");
  await expect(page.locator(".tool-card").first()).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search tools", exact: true })
    .fill("zzz-no-matching-tool-123");
  await expect(
    page.getByRole("heading", {
      name: "No tools found just yet.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator(".tool-card").first()).toBeVisible();
});
test("landing and discovery fit a narrow screen and expose keyboard skip navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.getByRole("link", { name: "Find my first box", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open my free box", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("reduced-motion preference disables decorative page motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".motion-frame")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".float-one")).toHaveCSS("animation-name", "none");
  await expect(
    page.getByRole("link", { name: "Find my first box", exact: true }),
  ).toBeVisible();
});
test("a pending box request shows progress and prevents duplicate clicks", async ({
  page,
}) => {
  // 请求由断言完成后显式放行，避免用固定毫秒数与页面更新竞争。
  let releaseRequest!: () => void;
  let markRequested!: () => void;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  const requestStarted = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  let requestCount = 0;
  await page.route("**/api/boxes/free", async (route) => {
    requestCount += 1;
    markRequested();
    await requestGate;
    await route.continue();
  });
  await page.goto("/discover?interest=student");
  try {
    await page.getByRole("button", { name: "Open my free box", exact: true }).click();
    await requestStarted;
    await expect(page.locator(".opening-scene")).toBeVisible();
    const pendingButton = page.getByRole("button", {
      name: "Curating your box…",
      exact: true,
    });
    await expect(pendingButton).toBeDisabled();
    await expect(pendingButton).toHaveAttribute("aria-busy", "true");
    await expect(page.locator(".discovery-form")).toHaveAttribute("aria-busy", "true");
    await expect(
      page.getByRole("textbox", { name: /What would you like to do/ }),
    ).toBeDisabled();
    await page.keyboard.press("Enter");
    expect(requestCount).toBe(1);
  } finally {
    releaseRequest();
  }
  await expect(page).toHaveURL(/\/box\/[^/?]+$/);
  await expect(page.locator(".recommendation")).toHaveCount(1);
  expect(requestCount).toBe(1);
});
test("analytics can be disabled without affecting discovery", async ({ page }) => {
  await page.goto("/privacy");
  const preference = page.getByRole("checkbox", {
    name: "Allow first-party usage analytics for this browser",
    exact: true,
  });
  // 先确认真实浏览器偏好已经读入，再明确退出；不把 SSR 的占位状态当成已退出。
  await expect(preference).toBeEnabled();
  await expect(preference).toBeChecked();
  await preference.uncheck();
  await expect(preference).not.toBeChecked();
  await expect(
    page.getByText(
      "Analytics is off. Your box, sign-in, and checkout features still work.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("mysterybox:analytics"))).toBe(
    "off",
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem("mysterybox:analytics-visitor")),
  ).toBeNull();

  const leakedHeaders: string[] = [];
  const activityRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (request.headers()["x-analytics-visitor"]) leakedHeaders.push(request.url());
    if (new URL(request.url()).pathname === "/api/activity")
      activityRequests.push(request.url());
    await route.continue();
  });
  await page.goto("/discover");
  await expect(
    page.getByRole("button", { name: "Open my free box", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".tool-card").first()).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("mysterybox:analytics-visitor")),
  ).toBeNull();
  expect(leakedHeaders).toEqual([]);
  expect(activityRequests).toEqual([]);

  await page.goto("/privacy");
  await expect(preference).toBeEnabled();
  await expect(preference).not.toBeChecked();
  await expect(
    page.getByText(
      "Analytics is off. Your box, sign-in, and checkout features still work.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("mysterybox:analytics"))).toBe(
    "off",
  );
  expect(leakedHeaders).toEqual([]);
  expect(activityRequests).toEqual([]);
});

test("copy prompt writes the exact displayed text to the clipboard", async ({ page }) => {
  const clipboardWrites: string[] = [];
  await page.exposeFunction("captureClipboardWrite", (text: string) => {
    clipboardWrites.push(text);
  });
  // 浏览器权限因运行环境而异：只替换系统剪贴板边界，仍通过真实按钮调用并核对完整内容。
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) =>
          (
            window as unknown as Window & {
              captureClipboardWrite: (value: string) => Promise<void>;
            }
          ).captureClipboardWrite(text),
      },
    });
  });
  await openFreeBox(page);
  const prompt = await page.locator(".prompt-card > p").textContent();
  expect(prompt?.trim().length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  expect(clipboardWrites).toEqual([prompt]);
});

test("browser Back and Forward restore the same result without creating another box", async ({
  page,
}) => {
  let creations = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/boxes/free"
    )
      creations += 1;
  });
  await openFreeBox(page);
  const resultUrl = page.url();
  const title = await page.locator(".result-header h1").textContent();
  const prompt = await page.locator(".prompt-card > p").textContent();
  const officialUrl = await page
    .locator('.recommendation a[target="_blank"]')
    .first()
    .getAttribute("href");
  const boxId = new URL(resultUrl).pathname.split("/").at(-1)!;
  const savedIds = await page.evaluate(() =>
    Object.keys(JSON.parse(sessionStorage.getItem("mysterybox:boxes") || "{}")),
  );
  expect(savedIds).toEqual([boxId]);

  await page.goBack();
  await expect(page).toHaveURL(/\/discover\?interest=developer$/);
  await expect(page.locator(".discovery-form")).toBeVisible();
  await expect(page.locator(".recommendation")).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(resultUrl);
  await expect(page.locator(".recommendation")).toHaveCount(1);
  await expect(page.locator(".result-header h1")).toHaveText(title!);
  await expect(page.locator(".prompt-card > p")).toHaveText(prompt!);
  await expect(
    page.locator('.recommendation a[target="_blank"]').first(),
  ).toHaveAttribute("href", officialUrl!);
  expect(
    await page.evaluate(() =>
      Object.keys(JSON.parse(sessionStorage.getItem("mysterybox:boxes") || "{}")),
    ),
  ).toEqual([boxId]);
  expect(creations).toBe(1);
});

test("demo checkout back-to-edit and cancellation return never unlock a premium box", async ({
  page,
}) => {
  const orderCreations: string[] = [];
  const paymentCompletions: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/checkout/orders") orderCreations.push(path);
    if (/^\/api\/checkout\/orders\/[^/]+\/(capture|demo-complete)$/.test(path))
      paymentCompletions.push(path);
  });
  const expectLocked = async () => {
    await expect(page.locator(".recommendation")).toHaveCount(0);
    expect(paymentCompletions).toEqual([]);
    expect(
      await page.evaluate(() =>
        Object.keys(JSON.parse(sessionStorage.getItem("mysterybox:boxes") || "{}")),
      ),
    ).toEqual([]);
  };
  await page.goto("/discover?interest=business&tier=premium");
  await page.getByRole("button", { name: "Try premium demo", exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\/return\?order=/);
  const checkoutUrl = page.url();
  await expect(
    page.getByRole("button", { name: "Open demo premium box", exact: true }),
  ).toBeEnabled();
  await expectLocked();

  await page.getByRole("link", { name: "Back to discovery", exact: true }).click();
  await expect(page).toHaveURL(/\/discover$/);
  const goal = page.getByRole("textbox", { name: /What would you like to do/ });
  await expect(goal).toBeEnabled();
  await goal.fill("Revise my plan before choosing a box");
  await expect(goal).toHaveValue("Revise my plan before choosing a box");
  await expectLocked();

  // 模拟支付服务回到已有取消路由；没有访问外部支付服务，也不调用完成接口。
  await page.goto("/discover?cancelled=1");
  await expect(
    page.getByText(
      "Checkout was canceled. No new box was opened. You can try again whenever you’re ready.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open my free box", exact: true }),
  ).toBeEnabled();
  await expectLocked();

  // 返回原订单也必须继续等待用户显式确认，不能因为历史记录或已有令牌自动开盒。
  await page.goto(checkoutUrl);
  await expect(
    page.getByRole("button", { name: "Open demo premium box", exact: true }),
  ).toBeEnabled();
  await expectLocked();
  expect(orderCreations).toHaveLength(1);
});

test("a free-box 503 retry reuses its key and returns the one box already created", async ({
  page,
}) => {
  const keys: string[] = [];
  const bodies: (string | null)[] = [];
  const serverBoxIds: string[] = [];
  const serverStatuses: number[] = [];
  await page.route("**/api/boxes/free", async (route) => {
    const request = route.request();
    keys.push(request.headers()["idempotency-key"] || "");
    bodies.push(request.postData());
    // 第一次请求真实到达本地模拟服务并保存盒子，再向 UI 返回 503，覆盖“已提交但响应丢失”。
    const response = await route.fetch();
    serverStatuses.push(response.status());
    const body = await response.json();
    if (body.box?.id) serverBoxIds.push(body.box.id);
    if (keys.length === 1) {
      await route.fulfill({
        response,
        status: 503,
        json: {
          error: {
            code: "TEMPORARILY_UNAVAILABLE",
            message: "Temporary connection problem. Please try your box again.",
          },
        },
      });
    } else {
      await route.fulfill({ response });
    }
  });
  await page.goto("/discover?interest=student");
  const goal = page.getByRole("textbox", { name: /What would you like to do/ });
  await goal.fill("Create a practical revision plan");
  const submit = page.getByRole("button", { name: "Open my free box", exact: true });
  await submit.click();
  await expect(page.locator(".discovery-form").getByRole("alert")).toContainText(
    "Temporary connection problem. Please try your box again.",
  );
  await expect(page).toHaveURL(/\/discover\?interest=student$/);
  await expect(submit).toBeEnabled();
  await expect(goal).toHaveValue("Create a practical revision plan");
  await expect(page.locator(".discovery-form")).toHaveAttribute("aria-busy", "false");
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i);
  expect(serverStatuses).toEqual([200]);
  expect(serverBoxIds).toHaveLength(1);
  expect(
    await page.evaluate(() => sessionStorage.getItem("mysterybox:boxes")),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("mysterybox:request:free") || "null")?.id,
    ),
  ).toBe(keys[0]);

  await submit.click();
  await expect(page).toHaveURL(/\/box\/[^/?]+$/);
  await expect(page.locator(".recommendation")).toHaveCount(1);
  expect(keys).toEqual([keys[0], keys[0]]);
  expect(bodies).toEqual([bodies[0], bodies[0]]);
  expect(serverStatuses).toEqual([200, 200]);
  expect(serverBoxIds).toEqual([serverBoxIds[0], serverBoxIds[0]]);
  expect(new URL(page.url()).pathname).toBe(`/box/${serverBoxIds[0]}`);
  expect(
    await page.evaluate(() =>
      Object.keys(JSON.parse(sessionStorage.getItem("mysterybox:boxes") || "{}")),
    ),
  ).toEqual([serverBoxIds[0]]);
  expect(
    await page.evaluate(() => sessionStorage.getItem("mysterybox:request:free")),
  ).toBeNull();
});
