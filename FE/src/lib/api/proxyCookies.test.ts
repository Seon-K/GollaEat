import { describe, expect, it } from "vitest";
import { rewriteSetCookieForFrontend } from "@/lib/api/proxyCookies";

describe("rewriteSetCookieForFrontend", () => {
  it("strips Domain and forces Path/SameSite", () => {
    const raw =
      "sessionid=abc; expires=Sun, 06 Dec 2026 08:42:19 GMT; HttpOnly; Max-Age=1209600; Path=/; SameSite=Lax; Secure; Domain=.up.railway.app";
    const out = rewriteSetCookieForFrontend(raw, true);
    expect(out.toLowerCase()).not.toContain("domain=");
    expect(out).toContain("Path=/");
    expect(out).toContain("SameSite=Lax");
    expect(out).toContain("Secure");
    expect(out.startsWith("sessionid=abc")).toBe(true);
  });

  it("omits Secure on http", () => {
    const out = rewriteSetCookieForFrontend("csrftoken=x; Path=/; Secure", false);
    expect(out).not.toContain("Secure");
    expect(out).toContain("SameSite=Lax");
  });
});
