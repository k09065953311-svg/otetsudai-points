import { defineConfig } from "vitest/config";

// セキュリティルールのテスト専用（Firebase エミュレーターの中で動かす）
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 20000, fileParallelism: false }
});
