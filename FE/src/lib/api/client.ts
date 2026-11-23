import type { ApiProfile } from "./types";
import { ApiError } from "@/lib/api/errors";

type JsonBody = unknown;

let sessionProfile: ApiProfile | null = null;
let csrfToken: string | null = null;
let sessionInitPromise: Promise<void> | null = null;
let sessionIdentity: string | null = null;
const identityListeners = new Set<() => void>();
export function onSessionIdentityChange(listener: () => void): () => void {
  identityListeners.add(listener);
  return () => { identityListeners.delete(listener); };
}
function recordIdentity(body: unknown, response?: Response) {
  const identity = response?.headers.get("X-GollaEat-Session") || (body as { cache_identity?: string } | null)?.cache_identity;
  if (!identity) return;
  const changed = sessionIdentity !== null && identity !== sessionIdentity;
  sessionIdentity = identity;
  if (changed) { sessionProfile = null; identityListeners.forEach((listener) => listener()); }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function getCsrfToken(): string | null {
  return csrfToken;
}

/** 테스트용 */
export function __resetApiClientForTests(): void {
  sessionIdentity = null;
  sessionProfile = null;
  csrfToken = null;
  sessionInitPromise = null;
}

export function __setCsrfTokenForTests(token: string | null): void {
  csrfToken = token;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { _raw: text };
    }
  }
  // 403 CSRF HTML 등
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text };
  }
}

export async function ensureSession(): Promise<void> {
  if (csrfToken) return;
  if (!sessionInitPromise) {
    sessionInitPromise = (async () => {
      const res = await fetch("/api/session", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const body = await parseBody(res);
      if (!res.ok) {
        sessionInitPromise = null;
        throw new ApiError(res.status, body);
      }
      const token = (body as { csrf_token?: string })?.csrf_token;
      if (!token) {
        sessionInitPromise = null;
        throw new ApiError(500, body, "csrf_token missing in /api/session");
      }
      csrfToken = token;
      recordIdentity(body, res);
      const profile = (body as { profile?: ApiProfile }).profile;
      sessionProfile = profile && Array.isArray(profile.criteria) ? profile : null;
    })().catch((error) => { sessionInitPromise = null; throw error; });
  }
  await sessionInitPromise;
}

export async function getBootstrapProfile(): Promise<ApiProfile | null> {
  await ensureSession();
  return sessionProfile;
}

export type ApiQuery = Record<
  string,
  string | number | boolean | null | undefined
>;

async function request<T>(
  method: string,
  path: string,
  options: {
    body?: JsonBody;
    query?: ApiQuery;
    _retried?: boolean;
  } = {},
): Promise<T> {
  if (!path.startsWith("/api/")) {
    throw new Error(`api client path must start with /api/: ${path}`);
  }
  if (path.endsWith("/") && path !== "/api/") {
    throw new Error(`api path must not end with /: ${path}`);
  }

  await ensureSession();

  const url = new URL(path, "http://local.invalid");
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const href = `${url.pathname}${url.search}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (MUTATING.has(method)) {
    if (!csrfToken) throw new ApiError(403, null, "csrf_token not ready");
    headers["X-CSRFToken"] = csrfToken;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(href, {
    method,
    credentials: "same-origin",
    headers,
    body:
      options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const body = await parseBody(res);
  recordIdentity(body, res);

  if (res.status === 403 && MUTATING.has(method) && !options._retried) {
    csrfToken = null;
    sessionInitPromise = null;
    await ensureSession();
    return request<T>(method, path, { ...options, _retried: true });
  }

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }

  // 세션 재발급 시 토큰 갱신
  if (path === "/api/session" || path.startsWith("/api/session?")) {
    const token = (body as { csrf_token?: string })?.csrf_token;
    if (token) csrfToken = token;
    recordIdentity(body, res);
  }

  if (path === "/api/profile") {
    const profile = body as ApiProfile;
    if (Array.isArray(profile?.criteria)) sessionProfile = profile;
  }
  return body as T;
}

export const apiGet = <T>(path: string, query?: ApiQuery) =>
  request<T>("GET", path, { query });

export const apiPost = <T>(path: string, body?: JsonBody) =>
  request<T>("POST", path, { body });

export const apiPut = <T>(path: string, body?: JsonBody) =>
  request<T>("PUT", path, { body });

export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, { body });

export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
