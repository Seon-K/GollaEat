"""AI 재료 표현의 표준 태그 연결"""
import re
import unicodedata

ALIASES = {
    'egg': ('난류', '달걀', '계란', '난백', '난황', '전란', '메추리알', '오리알'),
    'milk': ('우유', '유청', '분유', '치즈', '버터', '생크림', '유제품', '요거트', '요구르트'),
    'buckwheat': ('메밀',), 'nuts': ('견과류', '땅콩', '호두', '잣', '아몬드', '캐슈넛', '피스타치오', '마카다미아', '피칸', '헤이즐넛'),
    'soy': ('대두', '두부', '두유', '콩기름', '콩가루', '간장', '된장', '청국장', '대두유'),
    'wheat': ('밀가루', '통밀', '소맥', '밀전분', '세몰리나'),
    'mackerel': ('고등어',), 'crab': ('꽃게', '대게', '홍게', '게살', '게장'),
    'shrimp': ('새우',), 'pork': ('돼지고기', '삼겹살', '돈육', '베이컨', '판체타', '프로슈토'),
    'peach': ('복숭아',), 'tomato': ('토마토',), 'sulfites': ('아황산',),
    'chicken': ('닭고기', '닭가슴살', '닭다리살', '닭육수', '계육'),
    'beef': ('소고기', '쇠고기', '우육', '소갈비', '차돌박이', '한우', '소육수'),
    'squid': ('오징어',), 'shellfish': ('조개', '바지락', '홍합', '전복', '가리비', '꼬막', '백합조개', '굴소스', '생굴'),
    'fish': ('생선', '연어', '참치', '멸치', '갈치', '가자미', '명태', '대구살', '장어'),
    'crustacean': ('갑각류', '랍스터', '로브스터', '바닷가재'),
    'cheese-butter': ('치즈', '버터'), 'honey': ('꿀',), 'gelatin': ('젤라틴',),
    'other-meat': ('오리고기', '오리훈제', '훈제오리', '양고기', '사슴고기', '염소고기'),
}
EXACT = {'밀': 'wheat', '콩': 'soy', '게': 'crab', '굴': 'shellfish', '닭': 'chicken',
         'egg': 'egg', 'milk': 'milk', 'soy': 'soy', 'shrimp': 'shrimp', 'wheat': 'wheat'}
EXPANSION = {'shrimp': 'crustacean', 'crab': 'crustacean', 'mackerel': 'fish', 'cheese-butter': 'milk'}


def ingredient_tags(ingredient):
    text = re.sub(r'\s+', '', unicodedata.normalize('NFKC', ingredient)).lower()
    # 부정·대체 표현의 포함 단정 제외
    if any(word in text for word in ('미포함', '불포함', '무첨가', '제외', '없는', '없음', '대체', '프리')):
        return set()
    tags = {tag for tag, aliases in ALIASES.items() if any(alias in text for alias in aliases)}
    if text in EXACT:
        tags.add(EXACT[text])
    # 식물성 버터의 우유 오인 방지
    if any(word in text for word in ('땅콩버터', '아몬드버터', '코코넛버터', '식물성버터')):
        tags.discard('cheese-butter')
        if not any(word in text for word in ('우유', '유청', '분유', '치즈', '생크림')):
            tags.discard('milk')
    tags.update(EXPANSION[tag] for tag in list(tags) if tag in EXPANSION)
    return tags
