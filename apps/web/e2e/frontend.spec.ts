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
  await expect(
    page.getByRole("radio", { name: "Developer", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("textbox", { name: /What would you like to do/ })
    .fill("Build a small, useful side project");
  await page
    .getByRole("button", { name: "Open my free box", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Try premium demo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/checkout\/return\?order=/);
  await expect(
    page.getByText("This is a simulated payment.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open demo premium box", exact: true })
    .click();
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
    .fill(
      `ui-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    );
  await page
    .getByRole("button", { name: "Send sign-in code", exact: true })
    .click();
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
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toBeVisible();
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
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
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
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Find my first box", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open my free box", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("reduced-motion preference disables decorative page motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".motion-frame")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".float-one")).toHaveCSS("animation-name", "none");
  await expect(
    page.getByRole("link", { name: "Find my first box", exact: true }),
  ).toBeVisible();
});
test("a pending box request shows progress and prevents duplicate clicks", async ({
  page,
}) => {
  await page.route("**/api/boxes/free", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.goto("/discover?interest=student");
  await page
    .getByRole("button", { name: "Open my free box", exact: true })
    .click();
  await expect(page.locator(".opening-scene")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Curating your box…", exact: true }),
  ).toBeDisabled();
  await expect(page).toHaveURL(/\/box\/[^/?]+$/);
  await expect(page.locator(".recommendation")).toHaveCount(1);
});
test("analytics can be disabled without affecting discovery", async ({
  page,
}) => {
  await page.goto("/privacy");
  const preference = page.getByRole("checkbox", {
    name: "Allow first-party usage analytics for this browser",
    exact: true,
  });
  if (await preference.isChecked()) await preference.uncheck();
  await expect(
    page.getByText(
      "Analytics is off. Your box, sign-in, and checkout features still work.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto("/discover");
  await expect(
    page.getByRole("button", { name: "Open my free box", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("mysterybox:analytics-visitor"),
    ),
  ).toBeNull();
});
