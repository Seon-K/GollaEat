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
import { ApiError } from "@/lib/api/errors";

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
