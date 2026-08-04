import { defineConfig } from "@playwright/test";

const baseURL =
  process.env.E2E_BASE_URL?.trim() ||
  process.env.PLAYWRIGHT_BASE_URL?.trim() ||
  "http://localhost:3000";
const webServerCommand =
  process.env.E2E_WEB_SERVER_COMMAND?.trim() || "npm run dev";
const configuredSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
const expectedSupabaseUrl =
  process.env.E2E_EXPECTED_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
const pinnedAuthenticatedQaRun =
  process.env.E2E_TARGET_ENV === "development" &&
  Boolean(configuredSupabaseUrl) &&
  configuredSupabaseUrl === expectedSupabaseUrl;
const reuseVerifiedDevelopmentServer =
  process.env.E2E_REUSE_VERIFIED_DEVELOPMENT_SERVER === "true" &&
  pinnedAuthenticatedQaRun;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./qa-artifacts/playwright-test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "./qa-artifacts/playwright-report",
      },
    ],
  ],
  use: {
    baseURL,
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    // A credentialed run must start the configured command with this process's
    // pinned Supabase environment instead of trusting an unknown server already
    // listening on the loopback port.
    // Live limiter runs may reuse an already-running workspace server only
    // after an external runtime check confirms its pinned development origin.
    reuseExistingServer:
      !process.env.CI &&
      (!pinnedAuthenticatedQaRun || reuseVerifiedDevelopmentServer),
    timeout: 120_000,
  },
});
