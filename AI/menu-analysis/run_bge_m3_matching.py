#!/usr/bin/env python3
"""일반식당 메뉴명 ↔ 메뉴젠 공공 음식명 BGE-M3 임베딩 매칭 (상위 3개)."""
import argparse
import re
import unicodedata
from pathlib import Path
import numpy as np
import pandas as pd


def normalize(value):
    if pd.isna(value):
        return ''
    s = unicodedata.normalize('NFKC', str(value)).strip().lower()
    s = re.sub(r'\([^)]*\)|\[[^]]*\]', ' ', s)
    s = re.sub(r'\b\d+\s*(?:인분|인|개|팩|세트|g|kg|ml|l)\b', ' ', s)
    s = re.sub(r'[^0-9a-z가-힣]+', '', s)
    return s


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--menus', default='general_menus.csv', help='정제 데이터 전체 8436행 CSV')
    parser.add_argument('--foods', default='public_foods.csv')
    parser.add_argument('--output', default='menu_embedding_matches.csv')
    parser.add_argument('--batch-size', type=int, default=16)
    parser.add_argument('--device', default='cpu', choices=['cpu', 'mps', 'cuda'])
    args = parser.parse_args()

    from sentence_transformers import SentenceTransformer

    menus = pd.read_csv(args.menus, dtype={'preprocess_row_id': str}, low_memory=False)
    foods = pd.read_csv(args.foods, dtype={'fd_Code': str}, low_memory=False)
    required_m = {'preprocess_row_id', 'restaurant_type', '메뉴 이름'}
    required_f = {'fd_Code', 'fd_Nm'}
    if not required_m.issubset(menus.columns) or not required_f.issubset(foods.columns):
        raise ValueError(f'필수 컬럼 누락: 메뉴={required_m-set(menus.columns)}, 공공={required_f-set(foods.columns)}')
    menus = menus[menus['restaurant_type'].astype(str).str.strip().eq('일반식당')].copy()
    if menus['preprocess_row_id'].isna().any() or menus['preprocess_row_id'].duplicated().any():
        raise ValueError('preprocess_row_id가 비었거나 중복되었습니다.')
    foods = foods.dropna(subset=['fd_Code', 'fd_Nm']).drop_duplicates(subset=['fd_Code']).reset_index(drop=True)
    if menus.empty or foods.empty:
        raise ValueError('비교할 데이터가 없습니다.')
    menus['matching_name'] = menus['메뉴 이름'].map(normalize)
    foods['matching_name'] = foods['fd_Nm'].map(normalize)

    # 같은 메뉴명은 한 번만 임베딩하여 실행 시간 단축
    menu_texts = list(dict.fromkeys(x for x in menus['matching_name'] if x))
    food_texts = list(dict.fromkeys(x for x in foods['matching_name'] if x))
    print(f'일반식당 {len(menus):,}행 / 공공 음식 {len(foods):,}행')
    print(f'임베딩할 고유 이름: 일반 {len(menu_texts):,}개, 공공 {len(food_texts):,}개')
    print('BAAI/bge-m3 로딩 중... (최초 실행은 모델 다운로드가 필요합니다)')
    model = SentenceTransformer('BAAI/bge-m3', device=args.device)
    print('일반식당 음식명 임베딩 중...')
    menu_vec = model.encode(menu_texts, batch_size=args.batch_size, normalize_embeddings=True,
                            show_progress_bar=True, convert_to_numpy=True)
    print('공공 음식명 임베딩 중...')
    food_vec = model.encode(food_texts, batch_size=args.batch_size, normalize_embeddings=True,
                            show_progress_bar=True, convert_to_numpy=True)
    # normalized vectors => dot product = cosine similarity
    food_mat = np.asarray(food_vec, dtype=np.float32)
    food_lookup = {name: i for i, name in enumerate(food_texts)}
    food_row_vectors = food_mat[[food_lookup[x] if x else 0 for x in foods['matching_name']]]
    menu_lookup = {name: i for i, name in enumerate(menu_texts)}
    best = {}
    for start in range(0, len(menu_texts), 128):
        sub = np.asarray(menu_vec[start:start+128], dtype=np.float32)
        scores = sub @ food_row_vectors.T
        for offset, name in enumerate(menu_texts[start:start+128]):
            sc = scores[offset]
            # 동일 점수면 음식코드 정렬을 통해 재현 가능한 결과 유지
            top = np.lexsort((foods['fd_Code'].to_numpy(), -sc))[:3]
            # 정규화 완전일치는 반드시 후보에 포함 (코사인 유사도는 그대로 보존)
            exact = np.flatnonzero(foods['matching_name'].to_numpy() == name)
            if len(exact):
                top = list(exact[:3]) + [int(i) for i in top if i not in set(exact)]
                top = np.asarray(top[:3], dtype=int)
            best[name] = [(str(foods.iloc[i]['fd_Code']), str(foods.iloc[i]['fd_Nm']),
                           round(float(sc[i]), 6),
                           'normalized_exact' if name == foods.iloc[i]['matching_name'] else 'embedding')
                          for i in top]

    rows = []
    for _, r in menus.iterrows():
        item = {
            'preprocess_row_id': r['preprocess_row_id'],
            'place_id': r.get('place_id', ''),
            'restaurant_name': r.get('식당 이름', ''),
            'menu_name': r['메뉴 이름'],
            'menu_name_normalized': r['matching_name'],
            'description': r.get('description', ''),
            'match_review_status': '미검토',
            'allergen_verification_status': '공공참고정보_식당실재료미검증',
        }
        candidates = best.get(r['matching_name'], [])
        for rank in range(1, 4):
            candidate = candidates[rank-1] if rank <= len(candidates) else ('', '', None, '')
            item[f'top{rank}_fd_Code'] = candidate[0]
            item[f'top{rank}_fd_Nm'] = candidate[1]
            item[f'top{rank}_cosine_similarity'] = candidate[2]
            item[f'top{rank}_match_method'] = candidate[3]
        rows.append(item)
    result = pd.DataFrame(rows)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(out, index=False, encoding='utf-8-sig')
    print(f'완료: {out.resolve()} / {len(result):,}행')
    print('※ 점수만으로 확인/미매칭을 확정하지 않았습니다. 검토 후 분류하세요.')


if __name__ == '__main__':
    main()
