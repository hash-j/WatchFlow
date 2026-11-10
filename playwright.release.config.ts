import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

const baseURL = "http://127.0.0.1:3101";

// Read-only public checks against a fresh production server. The regular
// authenticated acceptance configuration and its guards remain unchanged.
export default defineConfig({
  ...base,
  testMatch: ["release-pwa.spec.ts", "responsive.spec.ts", "public-release-content.spec.ts"],
  workers: 1,
  retries: 0,
  outputDir: "./qa-artifacts/release-test-results",
  use: {
    ...base.use,
    baseURL,
    // Recording is unnecessary for this public audit and requires an extra
    // platform ffmpeg installation. Failure screenshots/traces remain available.
    video: "off",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3101",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
