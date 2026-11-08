/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    // The Rust server owns the API and the session WebSocket in development.
    proxy: {
      // `ws` carries the project terminal's socket, which lives under /api.
      "/api": { target: "http://127.0.0.1:3000", ws: true },
      "/ws": { target: "ws://127.0.0.1:3000", ws: true },
    },
  },
  build: {
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
