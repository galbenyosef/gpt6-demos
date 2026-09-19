import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
  server: {
    host: "127.0.0.1",
    port: 4311,
    strictPort: true,
    proxy: { "/api": { target: `http://127.0.0.1:${process.env.PORT || 4310}`, changeOrigin: false } },
  },
});
