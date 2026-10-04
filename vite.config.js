// ============================================================
// vite.config.js — Vite configuration
// ============================================================
// - React plugin
// - i18n auto-extract plugin
// - Dev server proxy /api → localhost:3000 (tránh CORS)
// - Build optimizations (chunk splitting)
// - Path aliases
// ============================================================

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import i18nPlugin from "./vite-plugin-i18n.mjs";

export default defineConfig(({ mode }) => {
  // Load .env theo mode
  const env = loadEnv(mode, process.cwd(), "");
  const isProd = mode === "production";

  return {
    // ---------- Plugins ----------
    // ✅ FIX: Cả 2 plugin đều NẰM TRONG array này
    plugins: [
      react(),
      i18nPlugin(),
    ],

    // ---------- Resolve ----------
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@components": path.resolve(__dirname, "./src/components"),
        "@pages": path.resolve(__dirname, "./src/pages"),
        "@data": path.resolve(__dirname, "./src/data"),
      },
    },

    // ---------- Dev server ----------
    server: {
      port: 5173,
      host: true, // Cho phép truy cập từ LAN
      // ✅ strictPort: true → KHÔNG tự nhảy sang 5174 khi 5173 bận.
      // Nếu 5173 bị chiếm, Vite sẽ báo lỗi rõ ràng để biết ngay có
      // tiến trình cũ đang giữ cổng (trước đây bị "im lặng" đổi cổng).
      strictPort: true,
      open: false,
      proxy: {
        // Dev: proxy /api → Express backend
        "/api": {
          target: env.VITE_BACKEND_URL || "http://localhost:3000",
          changeOrigin: true,
          secure: false,
        },
      },
    },

    // ---------- Preview server ----------
    preview: {
      port: 4173,
      host: true,
    },

    // ---------- Build ----------
    build: {
      outDir: "dist",
      sourcemap: !isProd, // Sourcemap cho dev
      minify: "esbuild",
      target: "es2020",
      chunkSizeWarningLimit: 1000, // kB

      rollupOptions: {
        output: {
          // Tách vendor chunks để cache tốt hơn
          manualChunks: {
            "react-vendor": ["react", "react-dom", "react-router-dom"],
            "chart-vendor": ["recharts"],
            "icon-vendor": ["lucide-react"],
          },

          // Tên file có hash để cache busting
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]",
        },
      },

      // Bỏ console/debugger trong production
      esbuild: isProd
        ? {
            drop: ["console", "debugger"],
          }
        : {},
    },

    // ---------- Optimization ----------
    optimizeDeps: {
      include: ["react", "react-dom", "react-router-dom"],
    },

    // ---------- CSS ----------
    css: {
      devSourcemap: true,
    },

    // ---------- Define global constants ----------
    define: {
      __APP_VERSION__: JSON.stringify(
        process.env.npm_package_version || "1.0.0"
      ),
    },
  };
});