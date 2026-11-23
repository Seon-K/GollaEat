/**
 * API 에러 — body 형태는 docs/api-gaps.md 실측 기준
 * - 400: { error: string } 예 "'menu_id'"
 * - 404: { error: { code, message } }
 * - 403 CSRF: HTML 문자열일 수 있음
 */
export class ApiRequestError extends Error {
  constructor(readonly kind: "timeout" | "network") {
    super(kind === "timeout"
      ? "응답이 지연되고 있습니다. 잠시 후 다시 확인해 주세요."
      : "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    this.name = "ApiRequestError";
  }
}

export function isRequestCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? ApiError.defaultMessage(status, body));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  static defaultMessage(status: number, body: unknown): string {
    if (status === 503) {
      const message = (body as { message?: unknown })?.message;
      if (typeof message === "string" && message.trim()) return message;
      return "서버가 일시적으로 응답하지 못했어요. 잠시 후 다시 시도해 주세요.";
    }
    if (status === 400) {
      const e = (body as { error?: unknown })?.error;
      if (typeof e === "string") return e;
    }
    if (status === 404) {
      const e = (body as { error?: { message?: string } })?.error;
      if (e && typeof e === "object" && typeof e.message === "string") {
        return e.message;
      }
    }
    if (status === 403) return "CSRF 검증 실패 또는 권한 없음";
    if (status === 405) return "지원하지 않는 메서드";
    return `API error ${status}`;
  }

  /** 400 문자열 에러 */
  get errorString(): string | null {
    const e = (this.body as { error?: unknown })?.error;
    return typeof e === "string" ? e : null;
  }

  /** 404 { code, message } */
  get errorObject(): { code?: string; message?: string } | null {
    const e = (this.body as { error?: unknown })?.error;
    if (e && typeof e === "object" && !Array.isArray(e)) {
      return e as { code?: string; message?: string };
    }
    return null;
  }
}
