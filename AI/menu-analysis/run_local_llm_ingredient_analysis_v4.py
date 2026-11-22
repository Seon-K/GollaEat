#!/usr/bin/env python3
"""골라잇 v4: 원문 근거 재료/구성음식 추출. 실제 식당 재료 검증 도구가 아님."""
import argparse, csv, json, random, re, time, urllib.request, urllib.error
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent
INGREDIENTS = ('닭사골육수','사골육수','들깨가루','토마토소스','콩비지','순두부','돼지고기','소고기','쇠고기','닭고기','동태','미나리','가자미','미역','김치','양파','마늘','두부','버섯','새우','오징어','계란','달걀','치즈','토마토','감자','당근','배추','우렁','들깨','고추장','된장','간장','참기름','우유','생크림','무','밥','낙지','차돌','쌀','밀가루','고기')
DISHES = ('제육볶음','가자미구이','된장찌개','김치찌개','새우튀김','우렁쌈장','연유치즈떡','감자튀김','떡볶이','순대','주먹밥','파전','타코','파히타','엔칠라다','브리또','부리또','파스타','피자','세트','버거','샌드위치','비빔밥','볶음밥','보울','라면','국밥','김밥','칼국수','솥밥','쌈밥','덮밥','육개장','소바','탕','찌개','냉채','튀김','구이','샐러드')
FIELDS = ('ingredients','components','uncertain_mentions')

def load(path):
    with open(path,encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def save(path,rows):
    with open(path,'w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]),extrasaction='ignore');w.writeheader();w.writerows(rows)
def js(v):return json.dumps(v,ensure_ascii=False)
def norm(s):return re.sub(r'[^0-9a-z가-힣]','',str(s).lower())
def uniq(seq):return list(dict.fromkeys(seq))
def occurrences(s,term):
    return [m.start() for m in re.finditer(re.escape(term),s)] if term else []
def within_component(s,term,components):
    """단어의 모든 출현이 완성 요리명 내부라면 식재료 추출 금지."""
    positions=occurrences(s,term)
    if not positions:return True
    covered=[]
    for c in components:
        if c==term:continue
        for start in occurrences(s,c):covered.append((start,start+len(c)))
    return all(any(a<=pos and pos+len(term)<=b for a,b in covered) for pos in positions)
def direct(term,s):return isinstance(term,str) and bool(term.strip()) and term.strip() in s
def safe_json(raw):
    try:obj=json.loads(raw)
    except json.JSONDecodeError:
        m=re.search(r'\{.*\}',raw,re.S)
        if not m:raise
        obj=json.loads(m.group())
    if not isinstance(obj,dict) or any(not isinstance(obj.get(k),list) for k in FIELDS):
        raise ValueError('필수 JSON 배열 누락')
    return obj

def ask_ollama(name,desc,model,host,timeout,retries):
    system='''식당 메뉴 원문에서 단어를 복사하는 추출기다. 원문에 없는 재료를 추측하지 않는다.
ingredients: 개별 식재료명. components: 완성 요리 또는 세트 구성 음식명.
재료명은 완성 요리명 내부에만 있으면 추출하지 않는다. 예: 가자미구이, 된장찌개, 우렁쌈장 -> components에 각각, ingredients에 가자미/된장/우렁 넣지 않는다.
설명에 '동태와 무, 미나리' -> ingredients=["동태","무","미나리"].
'닭사골육수와 들깨가루' -> ingredients=["닭사골육수","들깨가루"].
'떡볶이+튀김+순대+주먹밥' -> components=["떡볶이","튀김","순대","주먹밥"].
JSON 객체만 출력: {"ingredients":[],"components":[],"uncertain_mentions":[]}. 한국어 원문 유지.'''
    payload={'model':model,'stream':False,'format':'json','options':{'temperature':0,'num_predict':400},'messages':[{'role':'system','content':system},{'role':'user','content':js({'menu_name':name,'description':desc})}]}
    err=None
    for attempt in range(retries+1):
        try:
            req=urllib.request.Request(host.rstrip('/')+'/api/chat',data=js(payload).encode('utf-8'),headers={'Content-Type':'application/json'},method='POST')
            with urllib.request.urlopen(req,timeout=timeout) as resp: raw=json.load(resp)['message']['content']
            return safe_json(raw),attempt
        except (ValueError,KeyError,urllib.error.URLError,TimeoutError,OSError) as e:
            err=e
            if attempt<retries:time.sleep(1)
    raise RuntimeError(str(err))

def extract(name,desc,obj):
    source=(name+' '+desc).strip()
    accepted={k:[] for k in FIELDS};rejected=[]
    for k in FIELDS:
        for v in obj.get(k,[]):
            if direct(v,source):accepted[k].append(v.strip())
            elif isinstance(v,str):rejected.append(v)
        accepted[k]=uniq(accepted[k])
    # 원문에 직접 있는 구성 음식 후보: 식재료와 중첩될 때 완성 요리 우선
    components=uniq(accepted['components']+[d for d in DISHES if d in source])
    # '탕', '구이' 등 접미사 단독은 구성 음식으로 취급하지 않음
    components=[c for c in components if len(c)>1 and c not in ('탕','찌개','구이','튀김') or c in ('튀김','찌개') and re.search(r'(^|[+/,\s])'+re.escape(c)+r'($|[+/,\s])',source)]
    # 더 긴 구성 음식이 있을 때 부분 구성 음식 제거 (김치찌개 > 찌개)
    components=[c for c in components if not any(c!=d and c in d for d in components)]
    candidates=uniq(accepted['ingredients']+[w for w in INGREDIENTS if w in source])
    # 긴 재료명이 확인되면 그 내부의 짧은 재료명은 중복 기록하지 않음
    candidates=[w for w in candidates if not any(w!=other and w in other and other in source for other in candidates)]
    ingredients=[];rule_added=[];name_only=[];desc_based=[]
    for w in candidates:
        if any(d in w for d in DISHES if len(d)>=2 and d!=w):
            if w not in components:components.append(w)
            continue
        if within_component(source,w,components):continue
        # 짧은 단어의 우연한 부분 일치 방지. '무'는 '무,'/'무와' 등 허용
        if len(w)==1 and not re.search(r'(?<![가-힣])'+re.escape(w)+r'(?=$|[\s,./·()과와을를은는이가에로])',source):continue
        ingredients.append(w)
        if w not in accepted['ingredients']:rule_added.append(w)
        if w in desc and not within_component(desc,w,[c for c in components if c in desc]):desc_based.append(w)
        else:name_only.append(w)
    return {'ingredients':uniq(ingredients),'components':uniq(components),'uncertain_mentions':accepted['uncertain_mentions'],
            'rule_added':uniq(rule_added),'name_only':uniq(name_only),'description_based':uniq(desc_based),'rejected':uniq(rejected)}

def choose(rows,limit,mode):
    if mode=='first':return rows[:limit]
    seen=set();distinct=[]
    for r in rows:
        k=norm(r.get('menu_name',''))
        if k and k not in seen:seen.add(k);distinct.append(r)
    random.Random(42).shuffle(distinct)
    terms=('김치찌개','된장찌개','비빔밥','제육','불고기','순두부','칼국수','김밥','떡볶이','육개장')
    korean=[];used=set()
    for r in distinct:
        t=next((x for x in terms if x in r.get('menu_name','') and x not in used),None)
        if t:used.add(t);korean.append(r)
    chosen=korean[:min(limit//2,len(korean))]
    ids={r.get('preprocess_row_id') for r in chosen}
    chosen.extend(r for r in distinct if r.get('preprocess_row_id') not in ids and len(chosen)<limit)
    return chosen

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--matches',default='menu_matching_classified.csv');p.add_argument('--ingredients',default='public_ingredients_clean.csv')
    p.add_argument('--output-dir',default='local_llm_output_v4');p.add_argument('--model',default='qwen2.5:3b');p.add_argument('--host',default='http://127.0.0.1:11434')
    p.add_argument('--limit',type=int,default=20);p.add_argument('--sample',choices=('first','diverse'),default='diverse');p.add_argument('--timeout',type=int,default=180);p.add_argument('--retries',type=int,default=2)
    a=p.parse_args()
    if a.limit<1:p.error('--limit은 1 이상')
    matches=load(BASE/a.matches);refs=load(BASE/a.ingredients)
    bycode=defaultdict(list)
    for r in refs:bycode[r.get('fd_Code','')].append(r)
    selected=choose(matches,a.limit,a.sample)
    if not selected:p.error('입력 CSV에 분석할 메뉴가 없습니다')
    out=BASE/a.output_dir;out.mkdir(parents=True,exist_ok=True)
    extracts=[];comparisons=[]
    for i,r in enumerate(selected,1):
        rid=r.get('preprocess_row_id','');name=r.get('menu_name','') or '';desc=r.get('description','') or ''
        obj={k:[] for k in FIELDS};error='';status='llm_extracted';retry=0
        try:obj,retry=ask_ollama(name,desc,a.model,a.host,a.timeout,a.retries)
        except RuntimeError as e:status='llm_error_rule_fallback';error=str(e)[:300]
        result=extract(name,desc,obj)
        evidence='DESCRIPTION_SUPPORTED' if result['description_based'] else ('MENU_NAME_ONLY' if result['ingredients'] else 'NO_EXPLICIT_INGREDIENT')
        info='DESCRIPTION_MISSING' if not desc.strip() else ('NO_EXPLICIT_INGREDIENT' if not result['ingredients'] else 'TEXT_EVIDENCE_ONLY')
        extracts.append({'preprocess_row_id':rid,'restaurant_name':r.get('restaurant_name',''),'menu_name':name,'description':desc,
            'explicit_ingredients':js(result['ingredients']),'description_supported_ingredients':js(result['description_based']),
            'menu_name_only_ingredients':js(result['name_only']),'explicit_components':js(result['components']),
            'uncertain_mentions':js(result['uncertain_mentions']),'rule_added_ingredients':js(result['rule_added']),
            'rejected_unsupported_terms':js(result['rejected']),'evidence_level':evidence,'information_status':info,
            'extraction_status':status,'error':error,'retry_count':retry,'model':a.model,'restaurant_ingredient_verification':'NOT_VERIFIED'})
        code=(r.get('approved_fd_Code') or '').strip();approved=r.get('manual_verified','').strip().upper()=='Y' and bool(code)
        reference=bycode.get(code,[]) if approved else []
        refnames=uniq([x.get('food_Nm','') for x in reference if x.get('food_Nm')])
        overlaps=[x for x in result['ingredients'] if len(norm(x))>=2 and any(norm(x) in norm(y) or norm(y) in norm(x) for y in refnames if len(norm(y))>=2)]
        flags=[]
        if not approved:flags.append('MENU_MATCH_NOT_APPROVED')
        if approved and not reference:flags.append('APPROVED_REFERENCE_NOT_FOUND')
        if info=='DESCRIPTION_MISSING':flags.append('DESCRIPTION_MISSING')
        if evidence=='MENU_NAME_ONLY':flags.append('MENU_NAME_ONLY_EVIDENCE')
        if result['rejected']:flags.append('LLM_UNSUPPORTED_TERMS_REJECTED')
        if status!='llm_extracted':flags.append('LLM_ERROR')
        comparisons.append({'preprocess_row_id':rid,'menu_name':name,'approved_fd_Code':code if approved else '',
            'candidate_approved':'Y' if approved else 'N','comparison_status':'REFERENCE_NOT_APPROVED' if not approved else ('APPROVED_REFERENCE_TEXT_COMPARISON' if reference else 'APPROVED_REFERENCE_NOT_FOUND'),
            'explicit_ingredients':js(result['ingredients']),'explicit_components':js(result['components']),
            'public_reference_ingredients':js(refnames),'text_overlap':js(overlaps),'uncertainty_flags':js(flags),'restaurant_ingredient_verification':'NOT_VERIFIED'})
        print(f'[{i}/{len(selected)}] {name[:24]}: {status}, 재료 {len(result["ingredients"])}개, 구성 {len(result["components"])}개, {info}',flush=True)
    save(out/'llm_ingredient_extraction_v4.csv',extracts);save(out/'ingredient_comparison_v4.csv',comparisons)
    summary={'sample_rows':len(selected),'llm_completed':sum(x['extraction_status']=='llm_extracted' for x in extracts),
        'llm_errors':sum(x['extraction_status']!='llm_extracted' for x in extracts),
        'rows_with_explicit_ingredients':sum(bool(json.loads(x['explicit_ingredients'])) for x in extracts),
        'rows_description_missing':sum(x['information_status']=='DESCRIPTION_MISSING' for x in extracts),
        'rows_menu_name_only':sum(x['evidence_level']=='MENU_NAME_ONLY' for x in extracts),
        'rule_added_mentions':sum(len(json.loads(x['rule_added_ingredients'])) for x in extracts),
        'approved_reference_comparisons':sum(x['candidate_approved']=='Y' for x in comparisons),
        'warning':'텍스트에서 추출한 표현은 실제 식당 원재료 또는 알레르기 안전성을 검증하지 않습니다.'}
    (out/'summary_v4.json').write_text(js(summary),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2));print('결과:',out)
if __name__=='__main__':main()
