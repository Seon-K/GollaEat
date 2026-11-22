#!/usr/bin/env python3
"""메뉴젠 FdFood1 XML API 전체 수집. Python 3.10+, requests 필요."""
import argparse
import csv
import os
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote

import requests

URL = 'https://apis.data.go.kr/1390803/AgriFood/FdFood1/getKoreanFoodFdFoodList1'
FOOD_COLS = ['fd_Code','fd_Nm','upper_Fd_Grupp_Nm','fd_Grupp_Nm','fd_Wgh','food_Cnt','ingredient_rows']
ING_COLS = ['fd_Code','food_Code','food_Nm','fd_Eng_Nm','food_Wgh','allrgy_Info','nation_Std_Food_Grupp_Code_Nm','origin_Code_Nm','onslf_Std_Food_Grupp_Nm','amplt_Cl_Nm']


def clean(value):
    return '' if value is None or value.strip().lower() in {'null','none'} else value.strip()


def get_key():
    key = os.environ.get('DATA_GO_KR_SERVICE_KEY','').strip()
    if not key:
        env = Path(__file__).resolve().parent / '.env'
        if env.exists():
            for line in env.read_text(encoding='utf-8-sig').splitlines():
                if line.strip().startswith('DATA_GO_KR_SERVICE_KEY='):
                    key = line.split('=',1)[1].strip().strip('"').strip("'")
                    break
    if not key:
        sys.exit('인증키가 없습니다. .env에 DATA_GO_KR_SERVICE_KEY=인증키 를 설정하세요.')
    # 공공데이터포털에서 인코딩된 키를 복사해도 requests가 한 번만 URL 인코딩하도록 처리
    return unquote(key)


def request_page(session, key, page, size, retries=4):
    params = {"serviceKey": key,"page_No": page,"Page_Size": size,"service_Type": "xml",}
    for attempt in range(retries):
        try:
            response = session.get(URL, params=params, timeout=(10,60))
            response.raise_for_status()
            root = ET.fromstring(response.content)
            code = root.findtext('./header/result_Code','')
            msg = root.findtext('./header/result_Msg','')
            if code != '200':
                raise ValueError(f'API 응답 오류: result_Code={code}, result_Msg={msg}; page={page}, size={size}')
            total = int(root.findtext('./body/total_Count','0'))
            items = root.findall('./body/items/item')
            return total, items
        except (requests.RequestException, ET.ParseError) as e:
            if attempt == retries-1:
                raise RuntimeError(f'{page}페이지 요청 실패: HTTP {getattr(getattr(e, "response", None), "status_code", "unknown")}; 요청 주소·인증키·응답 본문을 확인하세요.') from None
            time.sleep(2 ** attempt)
    raise RuntimeError('재시도 초과')


def save_csv(path, columns, rows):
    with path.open('w',newline='',encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f,fieldnames=columns,extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description='농촌진흥청 메뉴젠 음식·재료 전체 수집')
    parser.add_argument('--page-size',type=int,default=20,help='검증된 값 20 권장')
    parser.add_argument('--out-dir',default='menugen_output')
    parser.add_argument('--max-pages',type=int,default=0,help='테스트: 1 / 전체: 0')
    args = parser.parse_args()
    if args.page_size < 1:
        parser.error('--page-size는 양수여야 합니다.')
    out = Path(args.out_dir)
    out.mkdir(parents=True,exist_ok=True)
    key = get_key()
    session = requests.Session()
    session.headers['User-Agent']='CapstoneMenuMatcher/1.0'
    foods = {}
    ingredients = []
    seen_ingredient = set()
    total_expected = None
    page = 1
    while True:
        total, items = request_page(session,key,page,args.page_size)
        if total_expected is None:
            total_expected = total
            print(f'API 전체 음식 건수: {total_expected}')
        elif total != total_expected:
            print(f'주의: total_Count 변경 {total_expected} -> {total}',file=sys.stderr)
        if not items:
            break
        for item in items:
            code = clean(item.findtext('fd_Code'))
            if not code:
                print(f'주의: 음식코드 없는 항목 건너뜀 (page={page})',file=sys.stderr)
                continue
            ingredient_nodes = item.findall('./food_List/food')
            food = {col:clean(item.findtext(col)) for col in FOOD_COLS if col!='ingredient_rows'}
            food['ingredient_rows'] = len(ingredient_nodes)
            if code in foods and foods[code] != food:
                print(f'주의: 음식코드 {code} 중복, 내용 상이',file=sys.stderr)
            foods[code] = food
            for node in ingredient_nodes:
                row = {col:(code if col=='fd_Code' else clean(node.findtext(col))) for col in ING_COLS}
                identity = tuple(row.get(c,'') for c in ING_COLS)
                if identity not in seen_ingredient:
                    seen_ingredient.add(identity)
                    ingredients.append(row)
        print(f'{page}페이지 수집: {len(items)}건 / 누적 고유 음식 {len(foods)}건')
        if len(items) < args.page_size or page*args.page_size >= total:
            break
        if args.max_pages and page >= args.max_pages:
            break
        page += 1
        time.sleep(0.15)
    save_csv(out/'public_foods.csv',FOOD_COLS,foods.values())
    save_csv(out/'public_ingredients.csv',ING_COLS,ingredients)
    print(f'저장 완료: 음식 {len(foods)}개, 재료 {len(ingredients)}행, 경로 {out.resolve()}')
    if not args.max_pages and len(foods) != total_expected:
        sys.exit(f'경고: 전체 {total_expected}개 중 고유 음식 {len(foods)}개만 수집됨. 누락·중복 여부를 확인하세요.')

if __name__ == '__main__':
    main()
