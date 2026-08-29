import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

import { loadLocalTestEnvironment } from "./lib/testing/local-environment.mjs";

loadLocalTestEnvironment();

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["integration/**/*.integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    sequence: {
      concurrent: false,
    },
  },
});
