import { defineConfig, devices } from "@playwright/test";

// A dedicated port so an e2e run never collides with `next dev` on :3000.
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    // Public routes need no real auth; placeholders keep next start from erroring.
    env: {
      AUTH_SECRET: "e2e-placeholder-secret-value-1234567890",
      AUTH_GITHUB_ID: "e2e-placeholder",
      AUTH_GITHUB_SECRET: "e2e-placeholder",
      AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
