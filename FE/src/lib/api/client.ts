import { ApiError } from "@/lib/api/errors";
import { controlledRequest, type ApiRequestOptions } from "@/lib/api/requestControl";
export type { ApiRequestOptions } from "@/lib/api/requestControl";

type JsonBody = unknown;

let csrfToken: string | null = null;
let sessionInitPromise: Promise<void> | null = null;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function getCsrfToken(): string | null {
  return csrfToken;
}

/** 테스트용 */
export function __resetApiClientForTests(): void {
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
    const init = controlledRequest(async (signal) => {
      const res = await fetch("/api/session", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const body = await parseBody(res);
      signal.throwIfAborted();
      if (!res.ok) {
        throw new ApiError(res.status, body);
      }
      const token = (body as { csrf_token?: string })?.csrf_token;
      if (!token) {
        throw new ApiError(500, body, "csrf_token missing in /api/session");
      }
      csrfToken = token;
    });
    sessionInitPromise = init;
    void init.catch(() => {
      if (sessionInitPromise === init) sessionInitPromise = null;
    });
  }
  await sessionInitPromise;
}

export type ApiQuery = Record<
  string,
  string | number | boolean | null | undefined
>;

async function sendRequest<T>(
  method: string,
  path: string,
  options: {
    body?: JsonBody;
    query?: ApiQuery;
    _retried?: boolean;
  },
  signal: AbortSignal,
): Promise<T> {
  if (!path.startsWith("/api/")) {
    throw new Error(`api client path must start with /api/: ${path}`);
  }
  if (path.endsWith("/") && path !== "/api/") {
    throw new Error(`api path must not end with /: ${path}`);
  }

  signal.throwIfAborted();
  await ensureSession();
  signal.throwIfAborted();

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
    signal,
    body:
      options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const body = await parseBody(res);
  signal.throwIfAborted();

  if (res.status === 403 && MUTATING.has(method) && !options._retried) {
    csrfToken = null;
    sessionInitPromise = null;
    await ensureSession();
    return sendRequest<T>(method, path, { ...options, _retried: true }, signal);
  }

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }

  // 세션 재발급 시 토큰 갱신
  if (path === "/api/session" || path.startsWith("/api/session?")) {
    const token = (body as { csrf_token?: string })?.csrf_token;
    if (token) csrfToken = token;
  }

  return body as T;
}

function request<T>(method: string, path: string, payload: { body?: JsonBody; query?: ApiQuery }, options?: ApiRequestOptions) {
  return controlledRequest((signal) => sendRequest<T>(method, path, payload, signal), options);
}

export const apiGet = <T>(path: string, query?: ApiQuery, options?: ApiRequestOptions) =>
  request<T>("GET", path, { query }, options);

export const apiPost = <T>(path: string, body?: JsonBody, options?: ApiRequestOptions) =>
  request<T>("POST", path, { body }, options);

export const apiPut = <T>(path: string, body?: JsonBody, options?: ApiRequestOptions) =>
  request<T>("PUT", path, { body }, options);

export const apiPatch = <T>(path: string, body?: JsonBody, options?: ApiRequestOptions) =>
  request<T>("PATCH", path, { body }, options);

export const apiDelete = <T>(path: string, options?: ApiRequestOptions) => request<T>("DELETE", path, {}, options);
