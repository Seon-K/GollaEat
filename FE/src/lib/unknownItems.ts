/**
 * 서버 unknown_items 태그 → UI 한글 라벨.
 * top-level: "allergen-milk:milk" / reason: "milk" | "source"
 * 매핑 불가한 원문 키는 노출하지 않는다.
 */

const TAG_LABELS: Record<string, string> = {
  milk: "우유",
  pork: "돼지고기",
  beef: "소고기",
  chicken: "닭고기",
  egg: "난류",
  nuts: "견과류",
  peanut: "땅콩",
  soy: "대두",
  wheat: "밀",
  shrimp: "새우",
  crab: "게",
  shellfish: "조개류",
  squid: "오징어",
  mackerel: "고등어",
  buckwheat: "메밀",
  peach: "복숭아",
  tomato: "토마토",
  sulfite: "아황산류",
  sulfites: "아황산류",
  source: "정보 출처",
  component_data: "재료 정보",
};

/** 단일 태그 → 라벨. 알 수 없으면 null */
export function humanizeUnknownTag(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tag = trimmed.includes(":")
    ? (trimmed.split(":").pop() ?? trimmed)
    : trimmed;
  const key = tag.toLowerCase();
  return TAG_LABELS[key] ?? null;
}

/**
 * unknown_items 배열을 중복 없는 한글 라벨로.
 * source 단독 태그는 성분 라벨이 있을 때 생략(메시지로 충분).
 */
export function humanizeUnknownItems(items: string[]): string[] {
  const labels: string[] = [];
  let hasSource = false;
  for (const item of items) {
    const label = humanizeUnknownTag(item);
    if (!label) continue;
    if (label === "정보 출처") {
      hasSource = true;
      continue;
    }
    if (!labels.includes(label)) labels.push(label);
  }
  if (labels.length === 0 && hasSource) {
    labels.push("정보 출처");
  }
  return labels;
}
