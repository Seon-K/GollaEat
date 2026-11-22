/**
 * 백엔드 API 프록시 (A2)
 *
 * 왜 Next Route Handler 프록시가 필요한가
 * 1) Django CSRF: HTTPS에서 변경 요청은 Referer/Origin 이 백엔드 origin 과 일치해야 한다.
 *    브라우저가 localhost(또는 Vercel)에서 직접 Railway 를 치면 cross-origin 이라
 *    Referer 정책·쿠키 SameSite 때문에 403 이 난다. 같은 origin `/api/*` 로 호출하고
 *    서버가 BACKEND_URL 기준으로 Origin/Referer 를 붙여 전달한다.
 * 2) 세션 쿠키 도메인: 백엔드 Set-Cookie 의 Domain=railway… 는 프론트 호스트에
 *    저장되지 않는다. Domain 을 제거하고 Path=/; SameSite=Lax 로 바꿔 프론트 도메인에
 *    심으면, 이후 브라우저→Next 프록시→백엔드로 Cookie 가 이어진다.
 */
import { type NextRequest, NextResponse } from "next/server";
import { rewriteSetCookieForFrontend } from "@/lib/api/proxyCookies";

export const dynamic = "force-dynamic";

export { rewriteSetCookieForFrontend };

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function backendBase(): string {
  const raw = process.env.BACKEND_URL?.trim();
  if (!raw) {
    throw new Error("BACKEND_URL is not set");
  }
  return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
}

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const base = backendBase();
  const subPath = path.map(encodeURIComponent).join("/");
  const search = req.nextUrl.search; // includes leading ? or ""
  const targetUrl = `${base}/api/${subPath}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "origin" || lower === "referer") return;
    // host 는 백엔드로 보내지 않음
    headers.set(key, value);
  });

  headers.set("Origin", base);
  headers.set("Referer", `${base}/`);

  const method = req.method.toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: { code: "proxy_upstream_error", message } },
      { status: 502 },
    );
  }

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "set-cookie") return; // handled below
    outHeaders.set(key, value);
  });

  const requestIsHttps =
    req.nextUrl.protocol === "https:" ||
    req.headers.get("x-forwarded-proto") === "https";

  const getSetCookie = upstream.headers.getSetCookie?.bind(upstream.headers);
  const setCookies = getSetCookie ? getSetCookie() : [];
  if (setCookies.length === 0) {
    const single = upstream.headers.get("set-cookie");
    if (single) setCookies.push(single);
  }
  for (const c of setCookies) {
    outHeaders.append(
      "set-cookie",
      rewriteSetCookieForFrontend(c, requestIsHttps),
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
