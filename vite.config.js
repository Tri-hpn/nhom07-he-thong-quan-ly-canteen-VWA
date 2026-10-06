// ============================================================
// VITE.CONFIG.JS — Vite configuration (V2)
// ============================================================
// V2:
//   - Giữ console.error/warn trong production (chỉ drop log/debug)
//   - Bỏ manualChunks recharts (nên lazy import ở Reports)
//   - optimizeDeps đầy đủ
// ============================================================

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import i18nPlugin from "./vite-plugin-i18n.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isProd = mode === "production";

  return {
    plugins: [react(), i18nPlugin()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@components": path.resolve(__dirname, "./src/components"),
        "@pages": path.resolve(__dirname, "./src/pages"),
        "@data": path.resolve(__dirname, "./src/data"),
      },
    },

    server: {
      port: 5173,
      host: true,
      strictPort: true,
      open: false,
      proxy: {
        "/api": {
          target: env.VITE_BACKEND_URL || "http://localhost:3000",
          changeOrigin: true,
          secure: false,
        },
      },
    },

    preview: {
      port: 4173,
      host: true,
    },

    build: {
      outDir: "dist",
      sourcemap: !isProd,
      minify: "esbuild",
      target: "es2020",
      chunkSizeWarningLimit: 1200,

      rollupOptions: {
        output: {
          // ✅ Tách vendor theo package thực tế đang dùng.
          // KHÔNG tách recharts riêng — nên lazy import ở Reports.
          manualChunks: {
            "react-vendor": ["react", "react-dom", "react-router-dom"],
            "icon-vendor": ["lucide-react"],
          },
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash].[ext]",
        },
      },

      // ✅ Chỉ drop console.log + debugger, giữ console.error/warn.
      // esbuild không hỗ trợ drop riêng log → dùng pure để tree-shake
      // call có side effect an toàn: console.log/debug chỉ bị loại
      // khi không có side effect (giữ nguyên console.error/warn).
      esbuild: isProd
        ? {
            drop: ["debugger"],
            pure: ["console.log", "console.debug", "console.trace"],
          }
        : {},
    },

    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "lucide-react",
      ],
    },

    css: {
      devSourcemap: true,
    },

    define: {
      __APP_VERSION__: JSON.stringify(
        process.env.npm_package_version || "1.0.0"
      ),
    },
  };
});