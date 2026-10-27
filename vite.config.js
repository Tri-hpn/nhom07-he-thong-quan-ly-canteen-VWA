// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VitePWA } from "vite-plugin-pwa";
import i18nPlugin from "./vite-plugin-i18n.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isProd = mode === "production";

  return {
    plugins: [
      react(),
      i18nPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        // 🔧 FIX: dùng public/manifest.json (đã có sẵn) thay vì disable
        manifest: false,
        // 🔧 FIX: TỰ ĐỘNG inject register script (trước = null → SW không đăng ký)
        injectRegister: "auto",
        // 🔧 FIX: DISABLE dev-dist (tránh sinh rác dev-dist/)
        devOptions: { enabled: false },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp}"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: "index.html",
          // 🔧 FIX: KHÔNG fallback SPA cho /api/*
          navigateFallbackAllowlist: [/^(?!\/api).*/],
          // 🔧 FIX: KHÔNG cache /api/* ở SW (để API luôn lấy mới)
          navigateFallbackDenylist: [/^\/api/],
          runtimeCaching: [
            // ① KHÔNG CACHE auth + telemetry (bảo mật session)
            {
              urlPattern: /^\/api\/(auth|telemetry)\//i,
              handler: "NetworkOnly",
            },
            // ② Ảnh menu — cache mạnh (ảnh tĩnh, có thể cache lâu)
            {
              urlPattern: /^\/api\/uploads\/menu\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "vwa-menu-images",
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // ③ Menu/categories — StaleWhileRevalidate
            {
              urlPattern: /^\/api\/(menu|categories|toppings|sizes)/i,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "vwa-api-menu",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 24 * 60 * 60,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // ④ Dynamic (orders/wallet/points/...) — NetworkFirst
            {
              urlPattern:
                /^\/api\/(orders|wallet|points|vouchers|chat|notifications)/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "vwa-api-dynamic",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // ⑤ Mọi API khác — NetworkFirst
            {
              urlPattern: /^\/api\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "vwa-api-misc",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
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
          cookieDomainRewrite: "localhost",
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              if (env.VITE_KEEP_ORIGIN_HOST !== "1") return;
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
    preview: { port: 4173, host: true },
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
            "chart-vendor": ["recharts"],
            "qr-vendor": ["qrcode.react", "@zxing/browser"],
          },
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name].[hash].[ext]",
        },
      },
      esbuild: isProd
        ? {
            drop: ["debugger"],
            pure: ["console.log", "console.debug", "console.trace"],
          }
        : {},
    },
    // 🔧 FIX: Thêm qrcode.react + @zxing/browser để Vite pre-bundle → dev start nhanh
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "lucide-react",
        "qrcode.react",
        "@zxing/browser",
      ],
    },
    css: { devSourcemap: true },
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || "1.0.0"),
    },
  };
});