// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages の公開パス（リポジトリ名）に合わせる
  base: "/hiki-indicator/",
  server: {
    host: true,        // LAN からアクセス可
    port: 5173,
    strictPort: true,  // 5173 が使えなければ起動失敗
  },
});
