// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "/hiki-indicator/",   // ← ここをプロジェクトページ用に変更
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
