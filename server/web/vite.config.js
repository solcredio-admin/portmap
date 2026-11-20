import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// One self-contained file, served by server.py at /app.js (no CDN, CSP 'self').
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../static",
    emptyOutDir: false,
    copyPublicDir: false,
    target: "es2020",
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: "src/main.jsx",
      output: { entryFileNames: "app.js", inlineDynamicImports: true },
    },
  },
});
