import { useLocation } from 'react-router-dom';
import './manage.css';
import './skeleton.css';

function Block({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`manage-skeleton-block ${className}`} />;
}

export function ManageButtonSkeleton() {
  return <span role="status" aria-label="처리 중" className="manage-button-skeleton"><Block /></span>;
}

export function ManageStatsSkeleton() {
  return <div className="manage-stats" role="status" aria-label="운영 현황 로딩 중" aria-busy="true">
    {Array.from({ length: 7 }, (_, index) => <div className="manage-skeleton-card" key={index}>
      <Block className="manage-skeleton-label" />
      <Block className="manage-skeleton-number" />
      <Block className="manage-skeleton-short" />
    </div>)}
  </div>;
}

export function ManageTableSkeleton({ columns = 4 }: { columns?: number }) {
  return <div role="status" aria-label="관리 목록 로딩 중" aria-busy="true">
    <div className="manage-table-wrap"><table aria-hidden="true"><thead><tr>
      {Array.from({ length: columns }, (_, index) => <th key={index}><Block className="manage-skeleton-short" /></th>)}
    </tr></thead><tbody>
      {Array.from({ length: 8 }, (_, row) => <tr key={row}>
        {Array.from({ length: columns }, (_, column) => <td key={column}><Block className={(row + column) % 2 ? 'manage-skeleton-label' : ''} /></td>)}
      </tr>)}
    </tbody></table></div>
    <div className="manage-pagination" aria-hidden="true"><Block className="manage-skeleton-label" /><Block className="manage-skeleton-short" /></div>
  </div>;
}

export function ManageRouteSkeleton() {
  const { pathname } = useLocation();
  if (pathname === '/manage/login') {
    return <div className="manage-app"><main className="manage-login" role="status" aria-label="관리자 로그인 화면 로딩 중" aria-busy="true">
      <div className="manage-skeleton-login" aria-hidden="true">
        <Block className="manage-skeleton-label" /><Block className="manage-skeleton-title" /><Block />
        <Block className="manage-skeleton-input" /><Block className="manage-skeleton-input" /><Block className="manage-skeleton-input" />
      </div>
    </main></div>;
  }
  return <div className="manage-app" role="status" aria-label="관리자 화면 로딩 중" aria-busy="true">
    <aside className="manage-sidebar" aria-hidden="true"><Block className="manage-skeleton-title" />
      {Array.from({ length: 7 }, (_, index) => <Block key={index} />)}
    </aside>
    <div className="manage-workspace"><header className="manage-header" aria-hidden="true"><Block className="manage-skeleton-label" /><Block className="manage-skeleton-short" /></header>
      <main className="manage-content"><div className="manage-skeleton-heading" aria-hidden="true"><Block className="manage-skeleton-short" /><Block className="manage-skeleton-title" /><Block className="manage-skeleton-label" /></div>
        {pathname === '/manage' || pathname === '/manage/' ? <ManageStatsSkeleton /> : <ManageTableSkeleton />}
      </main>
    </div>
  </div>;
}
