/** Set-Cookie 한 줄을 프론트 도메인용으로 변환 (Domain 제거) */
export function rewriteSetCookieForFrontend(
  raw: string,
  requestIsHttps: boolean,
): string {
  const parts = raw.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return raw;
  const [nameValue, ...attrs] = parts;
  const kept: string[] = [nameValue];
  for (const attr of attrs) {
    const lower = attr.toLowerCase();
    if (lower.startsWith("domain=")) continue;
    if (lower.startsWith("path=")) continue;
    if (lower === "secure") continue;
    if (lower.startsWith("samesite=")) continue;
    kept.push(attr);
  }
  kept.push("Path=/");
  kept.push("SameSite=Lax");
  if (requestIsHttps) kept.push("Secure");
  return kept.join("; ");
}
