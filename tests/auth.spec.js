const { test, expect } = require("@playwright/test");

test("login form renders", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#loginPage")).toBeVisible();
  await expect(page.locator("#loginEmail")).toBeVisible();
  await expect(page.locator("#loginPassword")).toBeVisible();
  await expect(page.locator("#loginBtn")).toBeVisible();
});

test("login flow (optional)", async ({ page }) => {
  const email = process.env.PLAYWRIGHT_EMAIL;
  const password = process.env.PLAYWRIGHT_PASSWORD;
  test.skip(!email || !password, "PLAYWRIGHT_EMAIL/PASSWORD not set");

  await page.goto("./");
  await page.locator("#loginEmail").fill(email);
  await page.locator("#loginPassword").fill(password);
  await page.locator("#loginBtn").click();

  await expect(page.locator("#loginPage")).toBeHidden();
  await expect(page.locator("#appContainer")).toBeVisible();
});
