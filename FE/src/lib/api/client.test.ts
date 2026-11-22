import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetApiClientForTests,
  __setCsrfTokenForTests,
  apiGet,
  apiPut,
  ensureSession,
  getCsrfToken,
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
