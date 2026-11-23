import { humanizeUnknownTag } from "./unknownItems";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function labels(value: unknown): string[] {
  const items = typeof value === "string" ? value.split(/[,;|/\n]+/) : Array.isArray(value) ? value : [];
  return items.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    .map((item) => humanizeUnknownTag(item) ?? item);
}

/** Display API declarations/brand labels only; never derive dietary judgement here. */
export function allergenDisplay(value: unknown) {
  const info = object(value), brand = object(info.brand_reference);
  const confirmed = (Array.isArray(info.declarations) ? info.declarations : []).flatMap((entry) => {
    const declaration = object(entry);
    return declaration.verification_status === "verified" && declaration.presence === "present"
      ? labels(declaration.canonical_tag || declaration.name_raw) : [];
  });
  const reported = [...labels(info.allergens_contains_normalized), ...labels(brand.allergens_contains_normalized)];
  return { labels: [...new Set([...confirmed, ...reported])], brandReference: !!Object.keys(brand).length };
}

export const STORE_CONFIRMATION_NOTICE = "실제 포함 여부와 교차접촉 가능성은 주문 전 매장에 한 번 더 확인해 주세요.";
