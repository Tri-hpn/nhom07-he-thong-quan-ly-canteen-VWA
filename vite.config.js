// ============================================================
// VITE.CONFIG.JS — Vite configuration (V4 - FINAL)
// ============================================================
// V4 (2026-10):
//   - ✅ FIX #18: comment rõ lý do changeOrigin=false
//     + cảnh báo nếu đổi port khác 5173
//   - Giữ V3: Microsoft OAuth local fix, console.error/warn
//     production, optimizeDeps đầy đủ
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
          // ✅ FIX #18: changeOrigin=false để giữ nguyên Host header
          // (localhost:5173) → backend reconstruct đúng redirect URI
          // cho Microsoft OAuth.
          //
          // ⚠️ LƯU Ý: Nếu bạn đổi port FE khác 5173 (VD: 5174),
          // PHẢI thêm origin đó vào CORS whitelist trong
          // server-json.js → app.use(cors({ origin: [...] }))
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