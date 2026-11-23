import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetApiClientForTests,
  __setCsrfTokenForTests,
  apiGet,
  apiPut,
  ensureSession,
  getCsrfToken,
  getBootstrapProfile,
  onSessionIdentityChange,
} from "@/lib/api/client";
import { ApiError, isRequestCancelled } from "@/lib/api/errors";
import { apiProvider } from "@/lib/api/providers/apiProvider";

describe("api client", () => {
  beforeEach(() => {
    __resetApiClientForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetApiClientForTests();
  });

  it("shares concurrent bootstrap requests and returns the session profile without another GET", async () => {
    const profile = { criteria: ["allergen-milk"], setup_completed: true };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ csrf_token: "tok", profile, cache_identity: "guest" }), { status: 200 }));
    const profiles = await Promise.all([getBootstrapProfile(), getBootstrapProfile(), getBootstrapProfile()]);
    expect(profiles).toEqual([profile, profile, profile]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not reuse the prior user's bootstrap profile after a session change", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ csrf_token: "tok", cache_identity: "first", profile: { criteria: ["allergen-milk"], setup_completed: true } }), { status: 200 }));
    await getBootstrapProfile();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ criteria: [] }), { status: 200, headers: { "X-GollaEat-Session": "second" } }));
    await apiGet("/api/restaurants");
    expect(await getBootstrapProfile()).toBeNull();
  });

  it("ensureSession stores csrf_token", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ csrf_token: "tok-1", identity: "guest_session" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await ensureSession();
    expect(getCsrfToken()).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("notifies cache owners when a normal API response belongs to another session", async () => {
    const changed = vi.fn();
    const unsubscribe = onSessionIdentityChange(changed);
    const response = (identity: string) => new Response(JSON.stringify({ csrf_token: "token", cache_identity: identity }), {
      status: 200, headers: { "content-type": "application/json", "X-GollaEat-Session": identity },
    });
    vi.mocked(fetch).mockResolvedValueOnce(response("one")).mockResolvedValueOnce(response("one")).mockResolvedValueOnce(response("two"));
    try {
      await ensureSession();
      await apiGet("/api/profile");
      expect(changed).not.toHaveBeenCalled();
      await apiGet("/api/profile");
      expect(changed).toHaveBeenCalledTimes(1);
    } finally { unsubscribe(); }
  });

  it("attaches X-CSRFToken on PUT", async () => {
    __setCsrfTokenForTests("csrf-abc");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ criteria: [], setup_completed: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await apiPut("/api/profile", { criteria: ["allergen-milk"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "X-CSRFToken": "csrf-abc",
        }),
      }),
    );
  });

  it("403 → reinit session → retry once", async () => {
    __setCsrfTokenForTests("old");
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response("<html>CSRF</html>", { status: 403 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ csrf_token: "new-tok", identity: "guest_session" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            criteria: ["allergen-milk"],
            setup_completed: true,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const res = await apiPut<{ criteria: string[] }>("/api/profile", {
      criteria: ["allergen-milk"],
    });
    expect(res.criteria).toEqual(["allergen-milk"]);
    expect(getCsrfToken()).toBe("new-tok");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retryHeaders = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(
      (retryHeaders.headers as Record<string, string>)["X-CSRFToken"],
    ).toBe("new-tok");
  });

  it("GET does not send CSRF", async () => {
    __setCsrfTokenForTests("csrf-abc");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ criteria: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await apiGet("/api/profile");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(
      (init.headers as Record<string, string>)["X-CSRFToken"],
    ).toBeUndefined();
  });

  it("throws ApiError on 404 JSON shape", async () => {
    __setCsrfTokenForTests("csrf-abc");
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "menu_not_found", message: "menu not found" },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );
    try {
      await apiGet("/api/menus/x");
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      if (e instanceof ApiError) {
        expect(e.status).toBe(404);
        expect(e.errorObject?.code).toBe("menu_not_found");
      }
    }
  });
});

describe("bounded and cancellable requests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetApiClientForTests();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    __resetApiClientForTests();
  });
  const sessionResponse = () => new Response(JSON.stringify({ csrf_token: "session-token" }), {
    headers: { "content-type": "application/json" },
  });

  it("clears a rejected session promise so manual retry can succeed", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(sessionResponse());
    await expect(ensureSession()).rejects.toMatchObject({ kind: "network" });
    await ensureSession();
    expect(getCsrfToken()).toBe("session-token");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares one session initialization across callers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse());
    await Promise.all([ensureSession(), ensureSession(), ensureSession()]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts a slow fetch after the default 15 second deadline", async () => {
    __setCsrfTokenForTests("token");
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const pending = apiGet("/api/menus");
    const failed = expect(pending).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(15_000);
    await failed;
    expect((vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it("bounds response body parsing too", async () => {
    __setCsrfTokenForTests("token");
    const response = new Response("{}");
    vi.spyOn(response, "text").mockImplementation(() => new Promise(() => {}));
    vi.mocked(fetch).mockResolvedValueOnce(response);
    const failed = expect(apiGet("/api/menus", undefined, { timeoutMs: 100 })).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(100);
    await failed;
  });

  it("cancels a caller waiting for session without aborting the shared session", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((r) => { resolve = r; }));
    const caller = new AbortController();
    const pending = apiGet("/api/menus", undefined, { signal: caller.signal });
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    caller.abort();
    await cancelled;
    expect((vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal?.aborted).toBe(false);
    resolve(sessionResponse());
    await ensureSession();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("forwards list parameters and cancels the provider fetch without a server error", async () => {
    __setCsrfTokenForTests("token");
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const caller = new AbortController();
    const pending = apiProvider.getMenus({ q: "김밥", page: 2, limit: 40, sort: "price_asc", category: "한식", min_price: 0 }, { signal: caller.signal });
    const cancelled = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const params = new URL(String(url), "http://test").searchParams;
    expect(Object.fromEntries(params)).toMatchObject({ q: "김밥", page: "2", limit: "40", sort: "price_asc", category: "한식", min_price: "0", personalize: "true" });
    caller.abort();
    expect(isRequestCancelled(await cancelled)).toBe(true);
    expect((init as RequestInit).signal?.aborted).toBe(true);
  });

  it("classifies fetch network failures separately from HTTP errors", async () => {
    __setCsrfTokenForTests("token");
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("connection lost"));
    await expect(apiGet("/api/menus")).rejects.toMatchObject({ kind: "network" });
  });
});
