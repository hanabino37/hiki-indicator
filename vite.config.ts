import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GH Pages で /hiki-indicator/ 配下に公開するため
  base: "/hiki-indicator/",
});
