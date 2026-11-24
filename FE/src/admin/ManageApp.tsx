import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { manageApi, ManageError } from './api';
import './manage.css';
import { ManageRouteSkeleton, ManageStatsSkeleton, ManageTableSkeleton, ManageButtonSkeleton } from './ManageSkeleton';

type Session = { authenticated: boolean; username: string; permissions: string[] };
type RecordData = { id: string; [key: string]: unknown };
type Field = { key: string; label: string; type?: 'number' | 'checkbox' | 'textarea' | 'tags'; options?: [string, string][] };
type Section = { title: string; app: string; model: string; columns: string[]; fields: Field[] };
const sections: Record<string, Section> = {
  criteria: { title: '알레르겐·제한재료', app: 'dietary', model: 'criterion', columns: ['id', 'name', 'kind', 'category', 'active'], fields: [
    { key: 'name', label: '이름' }, { key: 'category', label: '분류' }, { key: 'active', label: '활성', type: 'checkbox' },
  ] },
  rules: { title: '식이 판단 규칙', app: 'dietary', model: 'supportrule', columns: ['criterion_name', 'excluded_tags', 'source', 'enabled'], fields: [
    { key: 'excluded_tags', label: '제외 성분 태그 (쉼표로 구분)', type: 'tags' }, { key: 'source', label: '판단 근거·출처' }, { key: 'enabled', label: '규칙 사용', type: 'checkbox' },
  ] },
  restaurants: { title: '매장 관리', app: 'catalog', model: 'restaurant', columns: ['name', 'address', 'phone'], fields: [
    { key: 'name', label: '매장명' }, { key: 'address', label: '주소', type: 'textarea' }, { key: 'phone', label: '연락처' },
    { key: 'brand', label: '브랜드' }, { key: 'category', label: '카테고리' }, { key: 'restaurant_type', label: '매장 유형' },
  ] },
  menus: { title: '메뉴 관리', app: 'catalog', model: 'menu', columns: ['name', 'restaurant_name', 'price_amount'], fields: [
    { key: 'name', label: '메뉴명' }, { key: 'description', label: '설명', type: 'textarea' },
    { key: 'price_amount', label: '가격 (비우면 미확인)', type: 'number' }, { key: 'category', label: '카테고리' },
  ] },
  reports: { title: '오류 제보', app: 'catalog', model: 'informationreport', columns: ['content', 'category', 'status', 'created_at'], fields: [] },
  reviews: { title: '리뷰 관리', app: 'dietary', model: 'review', columns: ['menu_id', 'body', 'created_at'], fields: [] },
};
const labels: Record<string, string> = { name: '이름', kind: '유형', category: '분류', active: '사용 여부', address: '주소', phone: '연락처', restaurant_name: '매장', price_amount: '가격', sale_status: '판매 상태', content: '제보 내용', status: '처리 상태', created_at: '작성일', menu_id: '메뉴 ID', body: '리뷰 내용' };
Object.assign(labels, { id: 'ID', criterion_name: '연결 기준', excluded_tags: '제외 성분 태그', source: '근거·출처', enabled: '사용 여부' });
const values: Record<string, string> = { allergen: '알레르겐', ingredient: '제한재료', diet: '식이 유형', preference: '음식 선호', pending: '접수', reviewing: '검토 중', resolved: '반영 완료', rejected: '반려', unverified: '미확인', available: '판매 확인', unavailable: '판매 중지 확인', menu_price: '메뉴·가격', ingredients_allergens: '재료·알레르겐', business: '영업정보', other: '기타' };
function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '활성' : '비활성';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  const text = String(value);
  return values[text] || text;
}
function can(session: Session, section: Section, action: string) {
  return session.permissions.includes(`${section.app}.${action}_${section.model}`);
}

export default function ManageApp() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const auth = useQuery({ queryKey: ['manage', 'session'], queryFn: () => manageApi<Session>('session'), retry: false });
  const [logoutError, setLogoutError] = useState('');
  if (auth.isPending) return <ManageRouteSkeleton />;
  if (auth.isError) return <main className="manage-loading"><p role="alert">관리 서버에 연결하지 못했습니다.</p><button onClick={() => void auth.refetch()}>다시 시도</button></main>;
  const session = auth.data;
  const logout = async () => {
    try {
      await manageApi('logout', 'POST');
      client.clear();
      navigate('/manage/login', { replace: true });
    } catch (e) { setLogoutError((e as Error).message); }
  };
  return <div className="manage-app">
    {!session.authenticated ? <Routes><Route path="login" element={<Login onSuccess={() => { client.clear(); navigate('/manage', { replace: true }); }} />} /><Route path="*" element={<Navigate to="/manage/login" replace />} /></Routes> : <>
      <aside className="manage-sidebar"><NavLink className="manage-brand" to="/manage">GollaEat <small>운영 관리</small></NavLink>
        <nav aria-label="관리 메뉴"><NavLink to="/manage" end>대시보드</NavLink>{Object.entries(sections).filter(([, s]) => can(session, s, 'view')).map(([key, s]) => <NavLink key={key} to={`/manage/${key}`}>{s.title}</NavLink>)}</nav>
        <a href="/explore">사용자 화면으로 ↗</a></aside>
      <div className="manage-workspace"><header className="manage-header"><span>관리자 작업 공간</span><div>{session.username}<button onClick={() => void logout()}>로그아웃</button></div></header>
        {logoutError && <p className="manage-error" role="alert">{logoutError}</p>}
        <main className="manage-content"><Routes><Route index element={<Dashboard />} /><Route path="login" element={<Navigate to="/manage" replace />} />{Object.entries(sections).map(([key, s]) => <Route key={key} path={key} element={can(session, s, 'view') ? <Records key={key} resource={key} section={s} session={session} /> : <p role="alert">조회 권한이 없습니다.</p>} />)}<Route path="*" element={<div><h1>페이지를 찾을 수 없습니다.</h1><NavLink to="/manage">대시보드로 이동</NavLink></div>} /></Routes></main>
      </div></>}
  </div>;
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try { await manageApi('login', 'POST', Object.fromEntries(form)); onSuccess(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="manage-login"><form onSubmit={submit}><span className="manage-eyebrow">GOLLAEAT MANAGEMENT</span><h1>관리자 로그인</h1><p>관리자 계정에 등록된 이메일로 로그인하세요.</p><label>이메일<input name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required /></label><label>비밀번호<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p role="alert" className="manage-error">{error}</p>}<button className="manage-primary" disabled={busy}>{busy ? <ManageButtonSkeleton /> : '로그인'}</button><NavLink to="/explore">사용자 화면으로 돌아가기</NavLink></form></main>;
}

function Dashboard() {
  const query = useQuery({ queryKey: ['manage', 'dashboard'], queryFn: () => manageApi<{ counts: Record<string, number>; catalog_uses_db: boolean }>('dashboard') });
  return <><span className="manage-eyebrow">OVERVIEW</span><h1>운영 현황</h1><p className="manage-muted">기준 정보와 매장·메뉴를 관리하고 사용자 피드백을 확인하세요.</p>{query.isPending ? <ManageStatsSkeleton /> : query.isError ? <p role="alert">현황을 불러오지 못했습니다. <button onClick={() => void query.refetch()}>다시 시도</button></p> : <>{!query.data.catalog_uses_db && <p className="manage-error">현재 카탈로그는 CSV 조회 모드입니다. 여기서 수정한 DB 정보는 사용자 조회에 반영되지 않습니다.</p>}<div className="manage-stats">{Object.entries(query.data.counts).map(([key, value]) => <NavLink key={key} to={`/manage/${key === 'pending_reports' ? 'reports' : key}`}><span>{key === 'pending_reports' ? '미처리 제보' : sections[key]?.title}</span><strong>{value.toLocaleString()}</strong><small>목록 확인 →</small></NavLink>)}</div></>}</>;
}

function Records({ resource, section, session }: { resource: string; section: Section; session: Session }) {
  const client = useQueryClient();
  const [input, setInput] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RecordData | null>(null); const [message, setMessage] = useState('');
  const query = useQuery({ queryKey: ['manage', resource, search, page], queryFn: () => manageApi<{ results: RecordData[]; total: number }>(`${resource}?q=${encodeURIComponent(search)}&page=${page}`), retry: false });
  useEffect(() => { if (query.error instanceof ManageError && query.error.status === 401) void client.invalidateQueries({ queryKey: ['manage', 'session'] }); }, [query.error, client]);
  const refresh = async () => { setSelected(null); setMessage('처리되었습니다.'); await client.invalidateQueries({ queryKey: ['manage'] }); };
  return <><span className="manage-eyebrow">MANAGEMENT</span><h1>{section.title}</h1><p className="manage-muted">{resource === 'reviews' ? '리뷰 본문은 수정하지 않으며, 필요한 경우 삭제할 수 있습니다.' : resource === 'reports' ? '제보 근거를 확인한 후 검토·반영 결과를 기록하세요.' : '목록에서 항목을 선택하여 상세 정보를 확인하고 수정하세요.'}</p>
    <div className="manage-toolbar"><form onSubmit={e => { e.preventDefault(); setSearch(input); setPage(1); }}><input aria-label="목록 검색" placeholder="이름 또는 내용 검색" value={input} onChange={e => setInput(e.target.value)} /><button>검색</button></form>{['criteria', 'rules'].includes(resource) && can(session, section, 'add') && <button className="manage-primary" onClick={() => { setMessage(''); setSelected(resource === 'criteria' ? { id: '', name: '', code: '', kind: 'allergen', category: '', active: false } : { id: '', criterion: '', excluded_tags: [], source: '', enabled: true }); }}>{resource === 'criteria' ? '기준 정보 등록' : '판단 규칙 등록'}</button>}</div>
    {message && <p role="status">{message}</p>}{query.isPending ? <ManageTableSkeleton columns={section.columns.length + 1} /> : query.isError ? <p className="manage-error" role="alert">{query.error.message} <button onClick={() => void query.refetch()}>다시 시도</button></p> : <><div className="manage-table-wrap"><table><thead><tr>{section.columns.map(c => <th key={c}>{labels[c]}</th>)}<th>상세</th></tr></thead><tbody>{query.data.results.map(row => <tr key={row.id}>{section.columns.map(c => <td key={c}><span className="manage-cell">{display(row[c])}</span></td>)}<td><button onClick={() => { setMessage(''); setSelected(row); }}>열기</button></td></tr>)}</tbody></table>{!query.data.results.length && <p className="manage-empty">표시할 데이터가 없습니다.</p>}</div><div className="manage-pagination"><span>총 {query.data.total.toLocaleString()}건 · {page}페이지</span><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>이전</button><button disabled={page * 20 >= query.data.total} onClick={() => setPage(p => p + 1)}>다음</button></div></>}
    {selected && <Editor key={selected.id} resource={resource} section={section} record={selected} writable={can(session, section, selected.id ? 'change' : 'add')} deletable={can(session, section, 'delete')} close={() => setSelected(null)} saved={refresh} />}
  </>;
}

function Editor({ resource, section, record, writable, deletable, close, saved }: { resource: string; section: Section; record: RecordData; writable: boolean; deletable: boolean; close: () => void; saved: () => Promise<void> }) {
  const dialog = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState<RecordData>({ ...record, review_notes: record.review_notes || '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [dirty]);
  const attemptClose = () => { if (!busy && (!dirty || window.confirm('저장하지 않은 변경 사항을 닫을까요?'))) close(); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]') || []).filter(element => !element.closest('fieldset:disabled'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); previous?.focus(); };
  }, []);
  async function execute(action?: string) {
    setError(''); setBusy(true);
    try {
      const path = `${resource}${record.id ? `/${encodeURIComponent(record.id)}` : ''}`;
      if (action === 'delete') {
        if (!window.confirm('이 리뷰를 영구 삭제할까요? 복구할 수 없습니다.')) return;
        await manageApi(path, 'DELETE');
      } else if (resource === 'reports') {
        await manageApi(path, 'POST', { action, review_notes: draft.review_notes });
      } else {
        const keys = [...section.fields.map(f => f.key), ...(!record.id ? resource === 'criteria' ? ['code', 'kind'] : ['criterion'] : [])];
        await manageApi(path, record.id ? 'PATCH' : 'POST', Object.fromEntries(keys.map(k => [k, draft[k]])));
      }
      setDirty(false); await saved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const fields: Field[] = [...(!record.id ? resource === 'criteria' ? [{ key: 'code', label: '고유 코드 (영문·숫자·하이픈)' }, { key: 'kind', label: '유형', options: [['allergen', '알레르겐'], ['ingredient', '제한재료'], ['diet', '식이 유형'], ['preference', '음식 선호']] } satisfies Field] : [{ key: 'criterion', label: '연결할 기준 ID (기준 정보 목록에서 확인)', type: 'number' } satisfies Field] : []), ...section.fields];
  const change = (key: string, value: unknown) => { setDraft(d => ({ ...d, [key]: value })); setDirty(true); };
  return <div className="manage-overlay"><section ref={dialog} className="manage-editor" role="dialog" aria-modal="true" aria-labelledby="manage-editor-title" onKeyDown={e => { if (e.key === 'Escape') attemptClose(); }}><header><div><small>{record.id || '신규 등록'}</small><h2 id="manage-editor-title">{section.title} 상세</h2></div><button autoFocus onClick={attemptClose} disabled={busy}>닫기</button></header><form onSubmit={e => { e.preventDefault(); void execute(); }}>
    {resource === 'criteria' && <p className="manage-muted">새 기준은 비활성으로 등록한 뒤 판단 규칙에 제외 성분 태그와 근거를 연결하고 활성화하세요.</p>}
    <fieldset disabled={!writable || busy}>{fields.map(field => <label key={field.key}>{field.label}{field.options ? <select value={String(draft[field.key] ?? '')} onChange={e => change(field.key, e.target.value)}>{field.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select> : field.type === 'checkbox' ? <input type="checkbox" checked={Boolean(draft[field.key])} onChange={e => change(field.key, e.target.checked)} /> : field.type === 'textarea' || field.type === 'tags' ? <textarea rows={4} value={field.type === 'tags' ? (draft[field.key] as string[]).join(', ') : String(draft[field.key] ?? '')} onChange={e => change(field.key, field.type === 'tags' ? e.target.value.split(',').map(tag => tag.trim()) : e.target.value)} /> : <input type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 1 : undefined} required={['name', 'code', 'criterion'].includes(field.key)} value={String(draft[field.key] ?? '')} onChange={e => change(field.key, field.type === 'number' ? e.target.value === '' ? null : Number(e.target.value) : e.target.value)} />}</label>)}</fieldset>
    {resource === 'reviews' && <><p>메뉴 ID: {display(record.menu_id)}</p><p className="manage-full-text">{display(record.body)}</p></>}
    {resource === 'reports' && <><p>상태: {display(record.status)}</p><p>메뉴: {display(record.menu)} · 매장: {display(record.restaurant)}</p><p className="manage-full-text">{display(record.content)}</p><h3>수정 제안</h3><pre>{display(record.proposed_changes)}</pre><label>검토 메모<textarea rows={4} disabled={!writable || busy} value={String(draft.review_notes)} onChange={e => change('review_notes', e.target.value)} /></label><p className="manage-muted">재료·알레르겐 제보는 자동 반영할 수 없습니다. 근거 정보를 별도로 수정한 후 수동 반영 완료를 선택하세요.</p></>}
    {error && <p className="manage-error" role="alert">{error}</p>}<footer>{resource === 'reports' ? writable && ['pending', 'reviewing'].includes(String(record.status)) && [['review', '검토 시작'], ['reject', '반려'], ['apply', '수정 제안 반영'], ['resolve_manual', '수동 반영 완료']].map(([action, label]) => <button type="button" key={action} disabled={busy || !String(draft.review_notes).trim()} onClick={() => { if (!['apply', 'resolve_manual'].includes(action) || window.confirm(`${label} 처리할까요? 실제 정보가 수정되었는지 확인하세요.`)) void execute(action); }}>{label}</button>) : resource === 'reviews' ? deletable && <button type="button" className="manage-danger" disabled={busy} onClick={() => void execute('delete')}>리뷰 영구 삭제</button> : writable && <button className="manage-primary" disabled={busy}>{busy ? <ManageButtonSkeleton /> : '저장'}</button>}</footer>
  </form></section></div>;
}
