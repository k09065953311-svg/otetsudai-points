import { defineConfig, devices } from "@playwright/test";

// 画面の動作テスト（お試しモードで、スマホの画面サイズで操作する）
//   npm run test:e2e
export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:4173",
    ...devices["Pixel 7"],
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
  },
  webServer: { command: "npm run build && npx vite preview --port 4173 --strictPort", port: 4173, reuseExistingServer: true },
  reporter: [["list"]]
});
