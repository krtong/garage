const { test, expect } = require("@playwright/test");

test("login form renders", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  await expect(page.getByPlaceholder("••••••••")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("login flow (optional)", async ({ page }) => {
  const email = process.env.PLAYWRIGHT_EMAIL;
  const password = process.env.PLAYWRIGHT_PASSWORD;
  test.skip(!email || !password, "PLAYWRIGHT_EMAIL/PASSWORD not set");

  await page.goto("./");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeHidden();
  await expect(page.getByText("Process")).toBeVisible();
  await expect(page.getByText("Personal Ops")).toBeVisible();
});
