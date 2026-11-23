import { ApiRequestError } from "@/lib/api/errors";

export interface ApiRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export const REQUEST_TIMEOUT_MS = 15_000;

/** Covers session wait, fetch, response body and CSRF retry with one deadline. */
export async function controlledRequest<T>(
  task: (signal: AbortSignal) => Promise<T>,
  { signal: caller, timeoutMs = REQUEST_TIMEOUT_MS }: ApiRequestOptions = {},
): Promise<T> {
  if (caller?.aborted) throw new DOMException("Request cancelled", "AbortError");
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  caller?.addEventListener("abort", cancel, { once: true });
  let rejectAbort!: (error: unknown) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(timedOut
    ? new ApiRequestError("timeout")
    : new DOMException("Request cancelled", "AbortError"));
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return await Promise.race([task(controller.signal), aborted]);
  } catch (error) {
    if (controller.signal.aborted) {
      if (timedOut) throw new ApiRequestError("timeout");
      throw new DOMException("Request cancelled", "AbortError");
    }
    if (error instanceof TypeError) throw new ApiRequestError("network");
    throw error;
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
