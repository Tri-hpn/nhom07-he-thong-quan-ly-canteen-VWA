// ============================================================
// VITE.CONFIG.JS — Vite configuration (V3)
// ============================================================
// V3 (2026-10):
//   - ✅ FIX Microsoft OAuth local: changeOrigin=false +
//     thêm x-forwarded-host để backend reconstruct đúng
//     redirect URI (5173 thay vì 3000)
//   - Giữ V2: giữ console.error/warn production, bỏ manualChunks
//     recharts, optimizeDeps đầy đủ
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
          // ✅ FIX Microsoft OAuth local: giữ nguyên Host header
          // để backend thấy localhost:5173 thay vì localhost:3000
          changeOrigin: false,
          secure: false,
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              const host = req.headers.host;
              if (host) {
                proxyReq.setHeader("x-forwarded-host", host);
                proxyReq.setHeader(
                  "x-forwarded-proto",
                  req.connection?.encrypted ? "https" : "http"
                );
              }
            });
          },
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
          assetFileNames: "assets/[name].[hash].[ext]",
        },
      },

      // ✅ Chỉ drop console.log + debugger, giữ console.error/warn.
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