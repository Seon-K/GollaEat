/**
 * 로컬 Next 프록시 경유 CSRF 스모크
 *
 * 사전: BACKEND_URL 설정 + `npm run dev` (기본 http://localhost:3000)
 *
 *   npm run smoke:api
 */
const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

async function main() {
  const jar = new Map();
  /** @type {string | null} */
  let csrf = null;

  function absorb(res) {
    const list = res.headers.getSetCookie?.() || [];
    for (const raw of list) {
      const nv = raw.split(";")[0];
      const i = nv.indexOf("=");
      if (i > 0) jar.set(nv.slice(0, i), nv.slice(i + 1));
    }
  }

  function cookieHeader() {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async function call(method, path, body) {
    const headers = {
      Accept: "application/json",
      Cookie: cookieHeader(),
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && csrf) {
      headers["X-CSRFToken"] = csrf;
    }
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    absorb(res);
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { _raw: text.slice(0, 200) };
    }
    if (path.startsWith("/api/session") && parsed?.csrf_token) {
      csrf = parsed.csrf_token;
    }
    return { status: res.status, body: parsed };
  }

  const steps = [];
  const push = (name, r) => {
    steps.push({
      name,
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      csrf403: r.status === 403,
    });
  };

  try {
    const s = await call("GET", "/api/session");
    push("GET /api/session", s);
    if (!s.body?.csrf_token) {
      console.error("FAIL: no csrf_token from proxy session");
      process.exitCode = 1;
    }

    const p = await call("PUT", "/api/profile", {
      criteria: ["allergen-milk", "exclude-pork"],
    });
    push("PUT /api/profile", p);

    const m = await call("GET", "/api/menus?limit=3&personalize=true");
    push("GET /api/menus", m);
    const menuId = m.body?.results?.[0]?.menu_id;

    const j = menuId
      ? await call("POST", "/api/judgements", { menu_id: menuId })
      : { status: 0, body: { error: "no menu" } };
    push("POST /api/judgements", j);

    console.log("\n=== smoke-api (via Next proxy) ===");
    console.log(`BASE=${BASE}`);
    for (const step of steps) {
      const mark = step.ok ? "OK" : step.csrf403 ? "CSRF_403" : "FAIL";
      console.log(`${mark}  ${step.status}  ${step.name}`);
    }
    const csrfHit = steps.some((s) => s.csrf403);
    const allOk = steps.every((s) => s.ok);
    console.log(
      csrfHit
        ? "\nResult: CSRF 403 detected through proxy — check Origin/Referer rewrite"
        : allOk
          ? "\nResult: PASS (no CSRF 403)"
          : "\nResult: FAIL (non-CSRF errors — is `npm run dev` running with BACKEND_URL?)",
    );
    if (!allOk) process.exitCode = 1;
  } catch (e) {
    console.error(
      "\nsmoke-api could not reach Next server.",
      e instanceof Error ? e.message : e,
    );
    console.error("Start `npm run dev` with BACKEND_URL set, then retry.");
    process.exitCode = 1;
  }
}

main();
