import { useQuery } from '@tanstack/react-query';
import { ALLERGENS, allergenByLabel, allergenLabel } from '../data/allergens';
import { manageApi } from './api';

export type Allergen = {
  id?: number; name_raw: string; canonical_tag: string; presence: string;
  verification_status: string; source_id: number | null; confirmed_at: string | null;
  unknown_scope: string; applicability_scope: string;
};

function newAllergen(tag: string): Allergen {
  return { name_raw: allergenLabel(tag), canonical_tag: tag, presence: 'present', verification_status: 'unverified', source_id: null, confirmed_at: null, unknown_scope: '', applicability_scope: '메뉴' };
}

export function initialAllergens(rows: Allergen[] = [], reference = ''): Allergen[] {
  if (rows.length) return rows;
  return [...new Set(reference.split(/[,;|/\n]+/).map(name => {
    const text = name.trim();
    return allergenByLabel(text)?.id || ALLERGENS.find(item => item.id === text)?.id;
  }).filter((tag): tag is NonNullable<typeof tag> => !!tag))].map(newAllergen);
}

export function allergenSummary(rows: Allergen[] = [], reference = '') {
  const names = rows.length ? rows.filter(row => row.presence === 'present').map(row => allergenLabel(row.canonical_tag) || row.name_raw) : reference.split(/[,;|/\n]+/).map(name => name.trim()).filter(Boolean);
  return [...new Set(names)].join(', ') || '설정된 알레르기 없음';
}

export function AllergenEditor({ rows, disabled, onChange }: { rows: Allergen[]; disabled: boolean; onChange: (rows: Allergen[]) => void }) {
  const options = useQuery({ queryKey: ['manage', 'allergen-options'], queryFn: () => manageApi<{ allergens: { tag: string; name: string }[] }>('allergen-options') });
  return <fieldset disabled={disabled || !options.data} className="manage-allergens"><legend>알레르기</legend>
    {options.isPending && <p>알레르기 목록을 불러오는 중입니다.</p>}
    {options.isError && <p role="alert">알레르기 목록을 불러오지 못했습니다.</p>}
    <div className="manage-allergen-options">{options.data?.allergens?.map(item => <label key={item.tag}><input type="checkbox" checked={rows.some(row => row.canonical_tag === item.tag && row.presence === 'present')} onChange={event => {
      const remaining = rows.filter(row => row.canonical_tag !== item.tag);
      const existing = rows.find(row => row.canonical_tag === item.tag && row.presence === 'present');
      onChange(event.target.checked ? [...remaining, existing || newAllergen(item.tag)] : remaining);
    }} />{item.name}</label>)}</div>
  </fieldset>;
}
