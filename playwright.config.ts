import { defineConfig, devices } from "@playwright/test";

// Le dev server Vite est strictPort=1420 → on s'aligne dessus.
// localhost (vs 127.0.0.1) car Vite écoute en IPv6 par défaut (host=false → ::1).
const PORT = 1420;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Démarre Vite avant les tests. reuseExistingServer=true en local pour
  // qu'on puisse lancer `npm run dev` à côté et itérer.
  webServer: {
    command: "npm run dev -- --port 1420 --strictPort",
    url: BASE_URL,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
