import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4323",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run build && node scripts/test-server.mjs",
    url: "http://127.0.0.1:4323/",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ASTRO_TELEMETRY_DISABLED: "1",
      ASTRO_DEV_BACKGROUND: "1"
    }
  }
});
