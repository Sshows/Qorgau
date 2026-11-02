import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:4174' } },
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium") },
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes("cesium") ? "cesium" : undefined),
      },
    },
  },
});
