#!/usr/bin/env python3
"""골라잇: Ollama 로컬 LLM 재료 추출 + 공공 참고 재료 비교 (API 키 불필요)."""
import argparse
import csv
import json
import re
import urllib.request
import urllib.error
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent

def read_rows(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def write_rows(path, rows, fields):
    with path.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)

def call_ollama(name, description, model, host, timeout):
    instruction = (
        '너는 음식 메뉴 텍스트의 정보 추출기다. 메뉴명과 설명에 명시된 재료 또는 구성 음식만 추출한다. '
        '일반 레시피를 근거로 숨은 재료를 추측하거나 알레르기 성분을 추론하지 않는다. '
        '세트 구성 음식은 적되 그 음식 내부 재료는 추측하지 않는다. '
        '재료가 없으면 빈 배열을 쓴다. 반드시 JSON 객체로만 응답한다. '
        '형식: {"ingredients":["..."],"uncertain_mentions":["..."]}. '
        '불명확한 표현은 uncertain_mentions에 넣는다.'
    )
    payload = {'model': model, 'stream': False, 'format': 'json',
               'options': {'temperature': 0, 'num_predict': 450},
               'messages': [{'role':'system','content':instruction},
                            {'role':'user','content':json.dumps({'menu_name':name,'description':description}, ensure_ascii=False)}]}
    req = urllib.request.Request(host.rstrip('/')+'/api/chat',
        data=json.dumps(payload,ensure_ascii=False).encode('utf-8'),
        headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as response:
        response_data = json.load(response)
    raw = response_data['message']['content'].strip()
    obj = json.loads(raw)
    if not isinstance(obj,dict) or not isinstance(obj.get('ingredients'),list):
        raise ValueError('JSON 응답의 ingredients 배열이 없습니다')
    uncertain = obj.get('uncertain_mentions',[])
    if not isinstance(uncertain,list): uncertain=[]
    return ([str(v).strip() for v in obj['ingredients'] if isinstance(v,str) and v.strip()],
            [str(v).strip() for v in uncertain if isinstance(v,str) and v.strip()])

def normalize(s):
    return re.sub(r'[^0-9a-z가-힣]', '', str(s).lower())

def main():
    p=argparse.ArgumentParser(description='Ollama 로컬 LLM으로 메뉴 설명에서 명시 재료 추출')
    p.add_argument('--matches',default='menu_matching_classified.csv')
    p.add_argument('--ingredients',default='public_ingredients_clean.csv')
    p.add_argument('--output-dir',default='local_llm_output')
    p.add_argument('--model',default='qwen2.5:3b')
    p.add_argument('--host',default='http://127.0.0.1:11434')
    p.add_argument('--limit',type=int,default=20,help='이번에 LLM 처리할 메뉴 수 (기본 20)')
    p.add_argument('--timeout',type=int,default=180)
    args=p.parse_args()
    if args.limit<1: p.error('--limit은 1 이상이어야 합니다')
    matches=read_rows(BASE/args.matches)
    refs=read_rows(BASE/args.ingredients)
    by_code=defaultdict(list)
    for r in refs: by_code[r['fd_Code']].append(r)
    output=BASE/args.output_dir
    output.mkdir(parents=True,exist_ok=True)
    extraction=[]; comparison=[]
    count=0
    for r in matches:
        row_id=r.get('preprocess_row_id',''); name=r.get('menu_name',''); desc=r.get('description','')
        candidate=r.get('approved_fd_Code','') or r.get('top1_fd_Code','')
        approved=bool(r.get('approved_fd_Code','')) and r.get('manual_verified','').upper()=='Y'
        extracted=[]; uncertain=[]; status='not_run'; err=''
        if count<args.limit:
            count+=1
            try:
                extracted,uncertain=call_ollama(name,desc,args.model,args.host,args.timeout)
                status='llm_extracted'
            except (urllib.error.URLError,TimeoutError,ValueError,KeyError,UnicodeError) as e:
                status='llm_error';err=str(e)[:300]
            print(f'[{count}/{args.limit}] {name[:30]} : {status}',flush=True)
        extraction.append({'preprocess_row_id':row_id,'restaurant_name':r.get('restaurant_name',''),
            'menu_name':name,'description':desc,'llm_ingredients':json.dumps(extracted,ensure_ascii=False),
            'llm_uncertain_mentions':json.dumps(uncertain,ensure_ascii=False),
            'extraction_status':status,'extraction_error':err,
            'model':args.model if status=='llm_extracted' else ''})
        items=by_code.get(candidate,[])
        ref_names=[x.get('food_Nm','') for x in items if x.get('food_Nm')]
        ref_allergens=sorted({a.strip() for x in items for a in re.split(r'[,;/|·]+',x.get('allergens_normalized','')) if a.strip()})
        unknown=sum(x.get('allergen_normalization_status')=='not_provided' for x in items)
        review=sum(x.get('allergen_normalization_status')=='needs_review' for x in items)
        overlap=[x for x in extracted if len(normalize(x))>=2 and any(
            normalize(x) in normalize(y) or normalize(y) in normalize(x)
            for y in ref_names if len(normalize(y))>=2)]
        missing=[x for x in extracted if x not in overlap]
        flags=[]
        if not approved: flags.append('MENU_MATCH_NOT_APPROVED')
        if not desc: flags.append('DESCRIPTION_MISSING')
        if unknown: flags.append('PUBLIC_ALLERGEN_MISSING')
        if review: flags.append('PUBLIC_ALLERGEN_NEEDS_REVIEW')
        if not items: flags.append('PUBLIC_REFERENCE_NOT_FOUND')
        if status!='llm_extracted': flags.append('LLM_NOT_COMPLETED')
        if missing: flags.append('EXTRACTED_TERMS_NOT_IN_REFERENCE')
        if uncertain: flags.append('LLM_UNCERTAIN_MENTIONS')
        comparison.append({'preprocess_row_id':row_id,'menu_name':name,
            'candidate_fd_Code':candidate,'candidate_fd_Nm':r.get('top1_fd_Nm',''),
            'name_match_status':r.get('match_status',''), 'candidate_approved':'Y' if approved else 'N',
            'public_ingredient_count':len(items),'public_ingredients':json.dumps(ref_names,ensure_ascii=False),
            'public_allergens_reference':json.dumps(ref_allergens,ensure_ascii=False),
            'public_allergen_unknown_rows':unknown,'public_allergen_review_rows':review,
            'llm_ingredients':json.dumps(extracted,ensure_ascii=False),
            'text_overlap':json.dumps(overlap,ensure_ascii=False),
            'unmatched_extracted_terms':json.dumps(missing,ensure_ascii=False),
            'comparison_status':'text_only_not_verified' if status=='llm_extracted' else 'not_run',
            'restaurant_ingredient_verification':'NOT_VERIFIED',
            'uncertainty_flags':json.dumps(flags,ensure_ascii=False)})
    write_rows(output/'llm_ingredient_extraction.csv',extraction,list(extraction[0]))
    write_rows(output/'ingredient_comparison.csv',comparison,list(comparison[0]))
    summary={'menu_rows':len(matches),'public_ingredient_rows':len(refs),
             'llm_completed':sum(x['extraction_status']=='llm_extracted' for x in extraction),
             'llm_errors':sum(x['extraction_status']=='llm_error' for x in extraction),
             'llm_not_run':sum(x['extraction_status']=='not_run' for x in extraction),
             'verified_restaurant_ingredients':0,
             'warning':'LLM 결과와 공공데이터 재료는 실제 식당의 재료 및 알레르기 안전성을 검증하지 않습니다.'}
    (output/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    print('결과 폴더:',output)
    if summary['llm_errors']:
        print('LLM 오류가 있습니다. llm_ingredient_extraction.csv의 extraction_error를 확인하세요.')

if __name__=='__main__': main()
