/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "おうちギルド",
        short_name: "おうちギルド",
        description: "家族のお手伝い・勉強ポイントアプリ",
        lang: "ja",
        theme_color: "#141a2e",
        background_color: "#141a2e",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      }
    })
  ],
  build: { chunkSizeWarningLimit: 700 },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
