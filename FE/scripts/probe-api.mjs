/**
 * GollaEat API probe
 *
 * 사용:
 *   BACKEND_URL=https://example.com npm run probe:api
 *   # 또는
 *   node scripts/probe-api.mjs
 *
 * 결과:
 *   docs/api-samples/*.json
 *   docs/api-samples/_probe-log.json  (호출 요약·실패)
 *
 * 명세(@docs/api-spec.md)가 없어도 사용자 지시 엔드포인트 순서로 호출한다.
 * 요청 body 스키마는 실제 응답/에러로 검증하며, 추측 필드는 log에 남긴다.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "docs", "api-samples");

const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/+$/, "");
const LAT = 36.78;
const LNG = 127.05;

/** @type {Array<{ step: string; method: string; path: string; status?: number; ok?: boolean; error?: string; note?: string }>} */
const log = [];

class CookieJar {
  constructor() {
    /** @type {Map<string, string>} */
    this.cookies = new Map();
  }

  /** @param {Response} res */
  absorb(res) {
    const getSetCookie = res.headers.getSetCookie?.bind(res.headers);
    const list = getSetCookie ? getSetCookie() : [];
    if (!list.length) {
      const single = res.headers.get("set-cookie");
      if (single) list.push(single);
    }
    for (const raw of list) {
      const part = raw.split(";")[0];
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      this.cookies.set(name, value);
    }
  }

  header() {
    if (!this.cookies.size) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

const jar = new CookieJar();
/** @type {string | null} */
let csrfToken = null;

function extractCsrf(body) {
  if (!body || typeof body !== "object") return null;
  return (
    body.csrf_token ||
    body.csrfToken ||
    body?.data?.csrf_token ||
    body?.session?.csrf_token ||
    null
  );
}

function pickMenuIds(payload, limit = 5) {
  const items =
    payload?.results ||
    payload?.items ||
    payload?.menus ||
    payload?.data?.results ||
    payload?.data?.items ||
    payload?.data ||
    (Array.isArray(payload) ? payload : []);
  if (!Array.isArray(items)) return [];
  return items
    .map((m) => m.menu_id || m.id || m.menuId)
    .filter(Boolean)
    .slice(0, limit);
}

function slugName(method, path) {
  const clean = path
    .replace(/^\/api\//, "")
    .replace(/[?&=]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `${method.toLowerCase()}_${clean || "root"}`.slice(0, 120);
}

async function saveSample(name, payload) {
  const file = join(OUT_DIR, `${name}.json`);
  await writeFile(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return file;
}

/**
 * @param {string} method
 * @param {string} path  // /api/...  (trailing slash 금지)
 * @param {object} [opts]
 */
async function api(method, path, opts = {}) {
  const { body, sampleName, skipCsrf, note, expectError } = opts;
  if (!path.startsWith("/")) throw new Error(`path must start with /: ${path}`);
  if (path.endsWith("/") && path !== "/") {
    throw new Error(`URL must not end with /: ${path}`);
  }

  const url = `${BACKEND_URL}${path}`;
  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json" };
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;

  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (mutating && !skipCsrf) {
    if (!csrfToken) {
      const err = "csrf_token missing — call GET /api/session first";
      log.push({ step: sampleName || path, method, path, ok: false, error: err, note });
      return { status: 0, body: null, error: err };
    }
    headers["X-CSRFToken"] = csrfToken;
    // Django HTTPS CSRF: Referer(또는 Origin) 필수 — 없으면 403
    headers.Referer = `${BACKEND_URL}/`;
    headers.Origin = BACKEND_URL;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.push({
      step: sampleName || path,
      method,
      path,
      ok: false,
      error: msg,
      note,
    });
    await saveSample(sampleName || slugName(method, path), {
      _meta: { method, path, error: msg, note },
    });
    return { status: 0, body: null, error: msg };
  }

  jar.absorb(res);

  let parsed = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { _raw: text.slice(0, 4000) };
  }

  if (path === "/api/session" || path.startsWith("/api/session?")) {
    const token = extractCsrf(parsed);
    if (token) csrfToken = token;
  }

  // 403 → 세션 재초기화 후 1회 재시도 (마스터 규칙)
  if (res.status === 403 && mutating && !opts._retried) {
    log.push({
      step: sampleName || path,
      method,
      path,
      status: 403,
      ok: false,
      note: "403 — reinit session and retry once",
    });
    await api("GET", "/api/session", { sampleName: "get_session_retry", skipCsrf: true });
    return api(method, path, { ...opts, _retried: true });
  }

  const name = sampleName || slugName(method, path);
  const record = {
    _meta: {
      method,
      path,
      status: res.status,
      ok: res.ok,
      expectError: Boolean(expectError),
      note: note || null,
      savedAt: new Date().toISOString(),
    },
    body: parsed,
  };
  await saveSample(name, record);

  log.push({
    step: name,
    method,
    path,
    status: res.status,
    ok: res.ok,
    note,
    error: res.ok || expectError ? undefined : `HTTP ${res.status}`,
  });

  return { status: res.status, body: parsed, ok: res.ok, headers: res.headers };
}

async function main() {
  if (!BACKEND_URL) {
    console.error(
      [
        "BACKEND_URL 이 설정되지 않았습니다.",
        "예) BACKEND_URL=https://your-backend.example npm run probe:api",
        "또는 PowerShell: $env:BACKEND_URL='...'; npm run probe:api",
      ].join("\n"),
    );
    process.exitCode = 1;
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(
      join(OUT_DIR, "_probe-log.json"),
      JSON.stringify(
        {
          blocked: true,
          reason: "BACKEND_URL missing",
          log: [],
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`BACKEND_URL=${BACKEND_URL}`);
  console.log(`samples → ${OUT_DIR}`);

  // 1) session + catalogs
  await api("GET", "/api/session", { sampleName: "get_session" });
  await api("GET", "/api/dietary-criteria", { sampleName: "get_dietary_criteria" });
  await api("GET", "/api/allergens", { sampleName: "get_allergens" });
  await api("GET", "/api/restricted-ingredients", {
    sampleName: "get_restricted_ingredients",
  });
  await api("GET", "/api/menu-categories", { sampleName: "get_menu_categories" });

  // 2) profile
  await api("PUT", "/api/profile", {
    sampleName: "put_profile",
    body: { criteria: ["allergen-milk", "exclude-pork"] },
    note: "criteria ids from user probe instruction",
  });
  const profileRes = await api("GET", "/api/profile", { sampleName: "get_profile" });

  // 3) restaurants
  const restaurantsRes = await api(
    "GET",
    `/api/restaurants?lat=${LAT}&lng=${LNG}&radius_km=2&sort=distance_asc`,
    { sampleName: "get_restaurants" },
  );

  // 4) menus
  const menusRes = await api("GET", "/api/menus?limit=5&personalize=true", {
    sampleName: "get_menus",
  });
  let menuIds = pickMenuIds(menusRes.body);
  if (menuIds.length === 0) {
    // restaurants 응답에서 menu 참조가 있으면 보조 추출
    menuIds = pickMenuIds(restaurantsRes.body);
  }
  if (menuIds[0]) {
    await api("GET", `/api/menus/${menuIds[0]}`, {
      sampleName: "get_menu_detail",
      note: `menu_id=${menuIds[0]}`,
    });
  } else {
    log.push({
      step: "get_menu_detail",
      method: "GET",
      path: "/api/menus/{id}",
      ok: false,
      error: "no menu_id available from list",
    });
  }

  // restaurant detail (명세: 좌표·지도 URL 확인용)
  const restaurantId =
    restaurantsRes.body?.results?.[0]?.restaurant_id ||
    restaurantsRes.body?.results?.[0]?.restaurant?.restaurant_id ||
    restaurantsRes.body?.results?.[0]?.id ||
    null;
  if (restaurantId) {
    await api("GET", `/api/restaurants/${restaurantId}`, {
      sampleName: "get_restaurant_detail",
      note: `restaurant_id=${restaurantId}`,
    });
    await api("GET", `/api/restaurants/${restaurantId}/menus`, {
      sampleName: "get_restaurant_menus",
    });
  }

  // 5) judgements — 명세: { menu_id } 단건. 3개 이상 호출해 status 다양성 확인
  if (menuIds.length < 3) {
    const more = await api("GET", "/api/menus?limit=20&personalize=true", {
      sampleName: "get_menus_more",
    });
    menuIds = [...new Set([...menuIds, ...pickMenuIds(more.body, 20)])];
  }
  const judgementStatuses = [];
  const judgeTargets = menuIds.slice(0, 5);
  for (let i = 0; i < judgeTargets.length; i++) {
    const mid = judgeTargets[i];
    const r = await api("POST", "/api/judgements", {
      sampleName: i === 0 ? "post_judgements" : `post_judgements_${i + 1}`,
      body: { menu_id: mid },
      note: `spec: { menu_id } — ${mid}`,
    });
    if (r.ok && r.body) {
      judgementStatuses.push({
        menu_id: mid,
        status: r.body.status,
        reasons: r.body.reasons,
        problem_ingredients: r.body.problem_ingredients,
        unknown_items: r.body.unknown_items,
        sources: r.body.sources,
      });
    }
  }
  const judgementsOk = { body: { results: judgementStatuses } };

  // 6) recommendations / orders/check / communication / favorites
  await api("POST", "/api/recommendations/rank", {
    sampleName: "post_recommendations_rank",
    body: { menu_ids: menuIds.slice(0, 5) },
    note: "spec: { menu_ids }",
  });

  const targetMenu = menuIds[0];
  if (targetMenu) {
    const orderBody = {
      components: [{ id: targetMenu, role: "menu" }],
    };
    await api("POST", "/api/orders/check", {
      sampleName: "post_orders_check",
      body: orderBody,
    });
    await api("POST", "/api/communication", {
      sampleName: "post_communication",
      body: orderBody,
      note: "spec: same as orders/check",
    });
  }

  let favoriteId = null;
  if (targetMenu) {
    const fav = await api("POST", "/api/favorites", {
      sampleName: "post_favorites",
      body: { menu_id: targetMenu },
    });
    favoriteId = fav.body?.id ?? null;
    await api("GET", "/api/favorites", { sampleName: "get_favorites" });
    if (favoriteId != null) {
      await api("DELETE", `/api/favorites/${favoriteId}`, {
        sampleName: "delete_favorites",
      });
    } else {
      log.push({
        step: "delete_favorites",
        method: "DELETE",
        path: "/api/favorites/{id}",
        ok: false,
        error: "favorite id missing after POST",
      });
    }
  }

  // 7) reviews CRUD — 명세: body + disclose_conditions
  let reviewId = null;
  if (targetMenu) {
    const r = await api("POST", "/api/reviews", {
      sampleName: "post_reviews",
      body: {
        menu_id: targetMenu,
        body: "직원에게 소스 성분을 확인했습니다.",
        disclose_conditions: ["allergen-milk"],
      },
    });
    if (r.ok) {
      reviewId = r.body?.id ?? null;
    }
    await api("GET", `/api/reviews?menu_id=${encodeURIComponent(targetMenu)}`, {
      sampleName: "get_reviews",
    });
    if (reviewId != null) {
      await api("GET", `/api/reviews/${reviewId}`, {
        sampleName: "get_review_detail",
      });
      await api("PATCH", `/api/reviews/${reviewId}`, {
        sampleName: "patch_reviews",
        body: { body: "probe: 수정된 리뷰입니다." },
      });
      await api("DELETE", `/api/reviews/${reviewId}`, {
        sampleName: "delete_reviews",
      });
    } else {
      log.push({
        step: "patch_delete_reviews",
        method: "PATCH/DELETE",
        path: "/api/reviews/{id}",
        ok: false,
        error: "review id not found after POST",
      });
    }
  }

  // 8) chat
  await api("POST", "/api/chat", {
    sampleName: "post_chat",
    body: {
      message: "우유 알레르기가 있는데 김밥 추천해줘",
      location: { lat: LAT, lng: LNG },
    },
  });

  // 9) error samples (400 / 403 / 404)
  await api("POST", "/api/judgements", {
    sampleName: "error_400_judgements",
    body: {},
    expectError: true,
    note: "empty body → expect 400",
  });
  await api("GET", "/api/menus/does-not-exist-menu-id-000", {
    sampleName: "error_404_menu",
    expectError: true,
    note: "unknown menu_id → expect 404",
  });
  // 403: CSRF 없이 변경 요청
  {
    const saved = csrfToken;
    csrfToken = "invalid-csrf-token";
    await api("PUT", "/api/profile", {
      sampleName: "error_403_csrf",
      body: { criteria: ["allergen-milk"] },
      expectError: true,
      note: "invalid CSRF → expect 403 (may auto-retry with fresh session)",
      _retried: true, // 재시도 루프 방지 — 의도적으로 실패 샘플 확보
    });
    csrfToken = saved;
  }

  await saveSample("_probe-log", {
    backendUrl: BACKEND_URL,
    menuIds,
    judgementsSampleStatuses: summarizeJudgementStatuses(judgementsOk?.body),
    profileSnapshot: profileRes.body,
    log,
  });

  const failed = log.filter((l) => l.ok === false && !String(l.step).startsWith("error_"));
  console.log(`\nDone. steps=${log.length}, failed(non-error-samples)=${failed.length}`);
  if (failed.length) {
    console.log("Failed / blocked:");
    for (const f of failed) {
      console.log(`- ${f.method} ${f.path}: ${f.error || f.status} ${f.note || ""}`);
    }
  }
}

function summarizeJudgementStatuses(body) {
  if (!body) return null;
  const items =
    body.results ||
    body.judgements ||
    body.items ||
    body.data?.results ||
    body.data ||
    [];
  if (!Array.isArray(items)) return { rawKeys: Object.keys(body) };
  return items.map((j) => ({
    menu_id: j.menu_id || j.id,
    status: j.status || j.judgement_status,
  }));
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  try {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(
      join(OUT_DIR, "_probe-log.json"),
      JSON.stringify({ fatal: String(e) }, null, 2) + "\n",
    );
  } catch {
    /* ignore */
  }
});
