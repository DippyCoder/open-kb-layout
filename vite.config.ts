import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = "http://localhost:8788";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: API,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (req) => {
            if (req.getHeader("origin")) req.setHeader("origin", API);
          });
        },
      },
    },
  },
});
