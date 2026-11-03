import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4174",
        changeOrigin: false,
        configure(proxy) {
          proxy.on("proxyReq", (outgoing, incoming) =>
            outgoing.setHeader(
              "host",
              incoming.headers.host ?? "127.0.0.1:4173",
            ),
          );
        },
      },
    },
  },
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
