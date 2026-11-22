#!/usr/bin/env python3
"""골라잇: 근거 기반 로컬 LLM 재료/세트 구성 추출 및 승인된 공공 음식만 비교."""
import argparse,csv,json,re,urllib.request,urllib.error,random
from pathlib import Path
from collections import defaultdict
BASE=Path(__file__).resolve().parent

def read(path):
    with open(path,encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def write(path,rows,fields):
    with open(path,'w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
def norm(s):return re.sub(r'[^0-9a-z가-힣]','',str(s).lower())
def uniq(xs):return list(dict.fromkeys(xs))
def valid_mentions(values,source):
    """문자열이 입력 텍스트에 실제 등장한 경우만 보존 (추측·번역·환각 배제)."""
    accepted=[];rejected=[]
    for v in values:
        if not isinstance(v,str):continue
        v=v.strip(); nv=norm(v)
        if not nv:continue
        if len(nv)>=2 and nv in norm(source):accepted.append(v)
        else:rejected.append(v)
    return uniq(accepted),uniq(rejected)
def ollama(menu,description,model,host,timeout):
    system='''너는 음식 메뉴 텍스트에서 명시된 단어만 복사하는 정보 추출기다.
입력은 menu_name과 description이다. 일반적인 레시피, 상식, 번역, 외국어 재료 추측을 절대 사용하지 않는다.
ingredients: 입력 텍스트에 그대로 등장하는 개별 식재료명만 (예: 닭고기, 양파, 치즈).
components: 입력 텍스트에 그대로 등장하는 완성 요리 또는 세트 구성명만 (예: 타코, 파히타, 감자튀김).
uncertain_mentions: 재료인지 불분명한 원문 표현만. 명시된 것이 없으면 모든 배열은 비운다.
각 배열 원소는 반드시 입력 텍스트의 연속된 부분 문자열이어야 한다. 한국어 원문을 다른 언어로 번역하지 않는다.
반드시 {"ingredients":[],"components":[],"uncertain_mentions":[]} JSON 객체만 출력한다.'''
    data={'model':model,'stream':False,'format':'json','options':{'temperature':0,'num_predict':350},'messages':[{'role':'system','content':system},{'role':'user','content':json.dumps({'menu_name':menu,'description':description},ensure_ascii=False)}]}
    req=urllib.request.Request(host.rstrip('/')+'/api/chat',data=json.dumps(data,ensure_ascii=False).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=timeout) as resp:raw=json.load(resp)['message']['content']
    obj=json.loads(raw)
    if not isinstance(obj,dict):raise ValueError('JSON 객체가 아닙니다')
    for k in ('ingredients','components','uncertain_mentions'):
        if not isinstance(obj.get(k),list):raise ValueError(k+' 배열 누락')
    source=menu+' '+description
    accepted={};rejected=[]
    for k in ('ingredients','components','uncertain_mentions'):
        accepted[k],bad=valid_mentions(obj[k],source);rejected+=bad
    # 완성 요리 이름이 ingredients에 있으면 components로 옮긴다 (명시된 경우에만)
    dish_tokens=('타코','파히타','엔칠라다','브리또','부리또','파스타','피자','세트','버거','샌드위치','김치찌개','비빔밥','볶음밥','감자튀김','나초','보울','라면','국밥')
    moved=[v for v in accepted['ingredients'] if any(t in v for t in dish_tokens)]
    accepted['ingredients']=[v for v in accepted['ingredients'] if v not in moved]
    accepted['components']=uniq(accepted['components']+moved)
    return accepted,uniq(rejected)
def main():
    p=argparse.ArgumentParser()
    p.add_argument('--matches',default='menu_matching_classified.csv')
    p.add_argument('--ingredients',default='public_ingredients_clean.csv')
    p.add_argument('--output-dir',default='local_llm_output_v2')
    p.add_argument('--model',default='qwen2.5:3b');p.add_argument('--host',default='http://127.0.0.1:11434');p.add_argument('--timeout',type=int,default=180)
    p.add_argument('--limit',type=int,default=20)
    p.add_argument('--sample',choices=['diverse','first'],default='diverse',help='diverse: 서로 다른 메뉴/음식 유형을 골고루 시험')
    a=p.parse_args()
    matches=read(BASE/a.matches);refs=read(BASE/a.ingredients)
    bycode=defaultdict(list)
    for r in refs:bycode[r['fd_Code']].append(r)
    if a.limit<1:p.error('--limit은 1 이상')
    if a.sample=='first':selected=matches[:a.limit]
    else:
        # 정규화 메뉴명 기준 중복을 줄이고, 첫 20개가 한 식당에 쏠리지 않도록 분산
        seen=set(); unique=[]
        for r in matches:
            key=norm(r.get('menu_name',''))
            if key and key not in seen:seen.add(key);unique.append(r)
        rng=random.Random(42);rng.shuffle(unique)
        # 한식 메뉴 일부를 우선 포함하여 외국 음식 위주의 편향 완화
        korean_terms=('김치찌개','된장찌개','비빔밥','제육','불고기','순두부','칼국수','김밥','떡볶이','육개장')
        korean=[];seen_k=set()
        for r in unique:
            if any(t in r.get('menu_name','') for t in korean_terms):
                group=next(t for t in korean_terms if t in r.get('menu_name',''))
                if group not in seen_k:korean.append(r);seen_k.add(group)
        chosen=korean[:min(a.limit//2,len(korean))]
        ids={r['preprocess_row_id'] for r in chosen}
        chosen.extend(r for r in unique if r['preprocess_row_id'] not in ids and len(chosen)<a.limit)
        selected=chosen
    out=BASE/a.output_dir;out.mkdir(exist_ok=True,parents=True)
    ext=[];comp=[]
    for i,r in enumerate(selected,1):
        rid=r.get('preprocess_row_id','');name=r.get('menu_name','');desc=r.get('description','')
        result={'ingredients':[],'components':[],'uncertain_mentions':[]}; rejected=[];error='';status='llm_extracted'
        try:result,rejected=ollama(name,desc,a.model,a.host,a.timeout)
        except (urllib.error.URLError,TimeoutError,ValueError,KeyError,UnicodeError) as e:status='llm_error';error=str(e)[:300]
        ext.append({'preprocess_row_id':rid,'restaurant_name':r.get('restaurant_name',''),'menu_name':name,'description':desc,
                    'explicit_ingredients':json.dumps(result['ingredients'],ensure_ascii=False),'explicit_components':json.dumps(result['components'],ensure_ascii=False),
                    'uncertain_mentions':json.dumps(result['uncertain_mentions'],ensure_ascii=False),'rejected_unsupported_terms':json.dumps(rejected,ensure_ascii=False),
                    'extraction_status':status,'error':error,'model':a.model,'restaurant_ingredient_verification':'NOT_VERIFIED'})
        approved_code=(r.get('approved_fd_Code') or '').strip();approved=(r.get('manual_verified','').upper()=='Y' and bool(approved_code))
        refrows=bycode.get(approved_code,[]) if approved else []
        refnames=[x.get('food_Nm','') for x in refrows if x.get('food_Nm')]
        overlaps=[x for x in result['ingredients'] if len(norm(x))>=2 and any(norm(x) in norm(y) or norm(y) in norm(x) for y in refnames if len(norm(y))>=2)]
        flags=[]
        if not approved:flags.append('MENU_MATCH_NOT_APPROVED')
        if approved and not refrows:flags.append('APPROVED_REFERENCE_NOT_FOUND')
        if not desc.strip():flags.append('DESCRIPTION_MISSING')
        if rejected:flags.append('LLM_UNSUPPORTED_TERMS_REJECTED')
        if result['uncertain_mentions']:flags.append('UNCERTAIN_TEXT')
        if status!='llm_extracted':flags.append('LLM_ERROR')
        if approved and any(x.get('allergen_normalization_status')=='not_provided' for x in refrows):flags.append('PUBLIC_ALLERGEN_MISSING')
        comp.append({'preprocess_row_id':rid,'menu_name':name,'suggested_top1_fd_Code':r.get('top1_fd_Code',''),
                     'approved_fd_Code':approved_code if approved else '', 'candidate_approved':'Y' if approved else 'N',
                     'comparison_status':'TEXT_ONLY_REFERENCE_NOT_APPROVED' if not approved else ('APPROVED_REFERENCE_TEXT_COMPARISON' if refrows else 'APPROVED_REFERENCE_NOT_FOUND'),
                     'explicit_ingredients':json.dumps(result['ingredients'],ensure_ascii=False),'explicit_components':json.dumps(result['components'],ensure_ascii=False),
                     'public_reference_ingredients':json.dumps(refnames,ensure_ascii=False),'text_overlap':json.dumps(overlaps,ensure_ascii=False),
                     'uncertainty_flags':json.dumps(flags,ensure_ascii=False),'restaurant_ingredient_verification':'NOT_VERIFIED'})
        print(f'[{i}/{len(selected)}] {name[:25]} : {status}, 재료 {len(result["ingredients"])}개, 구성 {len(result["components"])}개, 제외 {len(rejected)}개',flush=True)
    write(out/'llm_ingredient_extraction_v2.csv',ext,list(ext[0]))
    write(out/'ingredient_comparison_v2.csv',comp,list(comp[0]))
    summary={'sample_rows':len(selected),'llm_completed':sum(r['extraction_status']=='llm_extracted' for r in ext),'llm_errors':sum(r['extraction_status']=='llm_error' for r in ext),'approved_reference_comparisons':sum(r['candidate_approved']=='Y' for r in comp),'unsupported_terms_rejected':sum(len(json.loads(r['rejected_unsupported_terms'])) for r in ext),'warning':'원문 명시 재료만 추출합니다. 공공참고정보 및 LLM 결과는 실제 식당 재료/알레르기 검증이 아닙니다.'}
    (out/'summary_v2.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2));print('결과 폴더:',out)
if __name__=='__main__':main()
