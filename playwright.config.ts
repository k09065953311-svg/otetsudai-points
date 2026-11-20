import { defineConfig, devices } from "@playwright/test";

// 画面の動作テスト（お試しモードで、スマホの画面サイズで操作する）
// --mode demo でビルドすると .env.production を読まないので、Firebase なしのお試しモードになる
//   npm run test:e2e
export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:4173",
    ...devices["Pixel 7"],
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
  },
  webServer: { command: "npx vite build --mode demo --outDir dist-demo && npx vite preview --outDir dist-demo --port 4173 --strictPort", port: 4173, reuseExistingServer: true },
  reporter: [["list"]]
});
