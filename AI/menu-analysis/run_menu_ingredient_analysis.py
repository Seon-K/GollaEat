#!/usr/bin/env python3
"""골라잇: 메뉴 설명 재료 추출(LLM) 및 공공 참고재료 비교. 표준 라이브러리만 사용."""
import argparse, csv, json, os, re, time, urllib.request, urllib.error
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent

def read_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def write_csv(path, rows, fields):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)

def split_items(value):
    return [x.strip() for x in re.split(r'[,;/|·、\n]+', value or '') if x.strip()]

def llm_extract(name, description, model, key):
    system=('너는 음식 메뉴 설명에서 명시적으로 언급된 재료/음식 구성요소만 추출하는 정보 추출기다. '
            '일반적인 레시피를 추측하지 마라. 메뉴명과 설명에서 직접 확인되는 항목만 추출하라. '
            '세트 구성요소도 추출하되 그 내부의 숨은 재료는 추측하지 마라. '
            'JSON 객체만 출력: {"ingredients": ["..."], "uncertain_mentions": ["..."]}. '
            '원문에 재료가 명시되지 않으면 빈 배열을 반환하라.')
    payload={'model':model,'temperature':0,'response_format':{'type':'json_object'},'messages':[
        {'role':'system','content':system}, {'role':'user','content':json.dumps({'menu_name':name,'description':description},ensure_ascii=False)}]}
    request=urllib.request.Request('https://api.openai.com/v1/chat/completions',
        data=json.dumps(payload,ensure_ascii=False).encode(),
        headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(request,timeout=75) as response:
        result=json.load(response)
    obj=json.loads(result['choices'][0]['message']['content'])
    if not isinstance(obj,dict) or not isinstance(obj.get('ingredients'),list):
        raise ValueError('LLM 응답 형식 오류')
    return {'ingredients':[str(x).strip() for x in obj['ingredients'] if str(x).strip()],
            'uncertain_mentions':[str(x).strip() for x in obj.get('uncertain_mentions',[]) if str(x).strip()]}

def norm(s):
    return re.sub(r'[^0-9a-z가-힣]','',str(s).lower())

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--matches',default='menu_matching_classified.csv')
    p.add_argument('--ingredients',default='public_ingredients_clean.csv')
    p.add_argument('--output-dir',default='ingredient_analysis_output')
    p.add_argument('--run-llm',action='store_true',help='명시적으로 지정한 경우에만 API 호출 및 과금 발생 가능')
    p.add_argument('--limit',type=int,default=20,help='LLM 실행할 최대 메뉴 수 (기본 20)')
    p.add_argument('--model',default='gpt-4o-mini')
    p.add_argument('--sleep',type=float,default=0.2)
    args=p.parse_args()
    matches=read_csv(BASE/args.matches); refs=read_csv(BASE/args.ingredients)
    out=BASE/args.output_dir;out.mkdir(exist_ok=True,parents=True)
    by_code=defaultdict(list)
    for r in refs:by_code[r['fd_Code']].append(r)
    key=os.environ.get('OPENAI_API_KEY','')
    if args.run_llm and not key:raise SystemExit('OPENAI_API_KEY 환경변수가 없습니다. 키는 코드/채팅에 입력하지 마세요.')
    extract_rows=[];comparison=[];count=0
    for r in matches:
        row_id=r['preprocess_row_id'];name=r.get('menu_name','');desc=r.get('description','')
        candidate=r.get('approved_fd_Code','') or r.get('top1_fd_Code','')
        approved=bool(r.get('approved_fd_Code','')) and r.get('manual_verified','').upper()=='Y'
        extracted=[]; uncertain=[]; status='not_run'; error=''
        if args.run_llm and count < args.limit and (name or desc):
            count+=1
            try:
                result=llm_extract(name,desc,args.model,key)
                extracted=result['ingredients'];uncertain=result['uncertain_mentions'];status='llm_extracted'
            except (urllib.error.HTTPError,urllib.error.URLError,ValueError,KeyError,TimeoutError) as e:
                status='llm_error';error=str(e)[:250]
            time.sleep(args.sleep)
        extract_rows.append({'preprocess_row_id':row_id,'restaurant_name':r.get('restaurant_name',''),
            'menu_name':name,'description':desc,'llm_ingredients':json.dumps(extracted,ensure_ascii=False),
            'llm_uncertain_mentions':json.dumps(uncertain,ensure_ascii=False),
            'extraction_status':status,'extraction_error':error,'model':args.model if status=='llm_extracted' else ''})
        items=by_code.get(candidate,[])
        reference_names=[x.get('food_Nm','') for x in items if x.get('food_Nm')]
        reference_allergens=sorted({a for x in items for a in split_items(x.get('allergens_normalized',''))})
        reference_unknown=sum(x.get('allergen_normalization_status')=='not_provided' for x in items)
        reference_review=sum(x.get('allergen_normalization_status')=='needs_review' for x in items)
        # 텍스트 표면형 비교만 수행. 재료 동일성/안전성 검증이 아님.
        overlaps=[x for x in extracted if len(norm(x))>=2 and any(norm(x) in norm(y) or norm(y) in norm(x) for y in reference_names if len(norm(y))>=2)]
        missing=[x for x in extracted if x not in overlaps]
        comparison.append({'preprocess_row_id':row_id,'menu_name':name,
            'candidate_fd_Code':candidate,'candidate_fd_Nm':r.get('top1_fd_Nm',''),
            'name_match_status':r.get('match_status',''),'candidate_approved': 'Y' if approved else 'N',
            'public_ingredient_count':len(items),'public_ingredients':json.dumps(reference_names,ensure_ascii=False),
            'public_allergens_reference':json.dumps(reference_allergens,ensure_ascii=False),
            'public_allergen_unknown_rows':reference_unknown,'public_allergen_review_rows':reference_review,
            'llm_ingredients':json.dumps(extracted,ensure_ascii=False),'text_overlap':json.dumps(overlaps,ensure_ascii=False),
            'unmatched_extracted_terms':json.dumps(missing,ensure_ascii=False),
            'comparison_status':('not_run' if status!='llm_extracted' else 'text_only_not_verified'),
            'restaurant_ingredient_verification':'NOT_VERIFIED',
            'uncertainty_flags':json.dumps([v for cond,v in [
                (not approved,'MENU_MATCH_NOT_APPROVED'),(not desc,'DESCRIPTION_MISSING'),
                (reference_unknown>0,'PUBLIC_ALLERGEN_MISSING'),(reference_review>0,'PUBLIC_ALLERGEN_NEEDS_REVIEW'),
                (not items,'PUBLIC_REFERENCE_NOT_FOUND'),(status!='llm_extracted','LLM_NOT_COMPLETED'),
                (bool(missing),'EXTRACTED_TERMS_NOT_IN_REFERENCE')] if cond],ensure_ascii=False)})
    write_csv(out/'llm_ingredient_extraction.csv',extract_rows,list(extract_rows[0]))
    write_csv(out/'ingredient_comparison.csv',comparison,list(comparison[0]))
    summary={'menu_rows':len(matches),'public_ingredient_rows':len(refs),'llm_completed':sum(r['extraction_status']=='llm_extracted' for r in extract_rows),
        'llm_errors':sum(r['extraction_status']=='llm_error' for r in extract_rows),
        'verified_restaurant_ingredients':0,'warning':'후보 음식의 공공 재료는 실제 식당 재료나 알레르기 안전성 검증이 아닙니다.'}
    (out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2));print('결과 폴더:',out)

if __name__=='__main__':main()
