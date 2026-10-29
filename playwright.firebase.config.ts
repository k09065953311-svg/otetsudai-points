import { defineConfig, devices } from "@playwright/test";

// Firebase モードの動作テスト。エミュレーター（偽の Firebase）の中で、親と子の2台のスマホを同時に動かす。
//   npm run test:e2e:firebase
export default defineConfig({
  testDir: "tests/e2e-firebase",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:4174",
    ...devices["Pixel 7"],
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
  },
  webServer: {
    command: "npx vite build --mode emulator --outDir dist-emulator && npx vite preview --outDir dist-emulator --port 4174 --strictPort",
    port: 4174,
    reuseExistingServer: false
  },
  reporter: [["list"]]
});
