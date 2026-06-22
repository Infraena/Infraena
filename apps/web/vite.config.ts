import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@idp/shared-types": path.resolve(
        __dirname,
        "../../packages/shared-types/src"
      ),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:8080",
      "/auth": "http://localhost:8080",
      "/socket.io": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
});
