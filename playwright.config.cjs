const { defineConfig } = require("@playwright/test");

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || "https://krtong.github.io/garage/";

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
