import path from "node:path";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { rewriteSetCookieForFrontend } from "./src/lib/api/proxyCookies";

function backendProxy(apiTarget: string): ProxyOptions {
  const base = apiTarget.replace(/\/+$/, "").replace(/\/api$/i, "");
  return {
    target: base,
    changeOrigin: true,
    configure(proxy) {
      proxy.on("proxyReq", (proxyReq) => {
        // Django CSRF: Origin/Referer 를 백엔드 origin 과 맞춤
        proxyReq.setHeader("Origin", base);
        proxyReq.setHeader("Referer", `${base}/`);
      });
      proxy.on("proxyRes", (proxyRes) => {
        const raw = proxyRes.headers["set-cookie"];
        if (!raw) return;
        const list = Array.isArray(raw) ? raw : [raw];
        // 로컬 http://127.0.0.1 에서는 Secure 쿠키가 저장되지 않음 → 제거
        proxyRes.headers["set-cookie"] = list.map((c) =>
          rewriteSetCookieForFrontend(c, false),
        );
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget =
    env.VITE_API_PROXY_TARGET?.trim() ||
    env.BACKEND_ORIGIN?.trim() ||
    env.BACKEND_URL?.trim() ||
    "http://127.0.0.1:8000";

  const api = backendProxy(apiTarget);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/api": api,
        "/admin": api,
        "/static": api,
      },
    },
    preview: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/api": api,
        "/admin": api,
        "/static": api,
      },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
