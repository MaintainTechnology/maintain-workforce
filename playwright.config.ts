import { defineConfig, devices } from "@playwright/test";

// E2E — spec definition of done. The starred flows run against a seeded database in
// the deploy pipeline and block promotion. Two projects because the spec sets two
// different viewport contracts: company screens must work at 375px (a supervisor
// approving from a ute), the admin portal is desktop-first at 1280px.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.APP_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "company-mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /company|starred/,
    },
    {
      name: "admin-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
      testMatch: /admin|starred/,
    },
  ],
  webServer: process.env.APP_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? "npm run start" : "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
      },
});
