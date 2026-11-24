// @vitest-environment jsdom
import { createElement as h } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ManageApp from './ManageApp';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: '/manage/*', element: h(ManageApp) })))));
}
const respond = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));

describe('관리자 화면', () => {
  it('비로그인 상태에서 로그인 화면을 표시하고 CSRF를 포함해 인증한다', async () => {
    const fetcher = vi.fn((url: string) => url.endsWith('/session') ? respond({ authenticated: false, csrf: 'csrf-token', username: '', permissions: [] }) : respond({ message: '계정 정보 확인' }, 401));
    vi.stubGlobal('fetch', fetcher);
    mount('/manage/menus');
    await screen.findByRole('heading', { name: '관리자 로그인' });
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'operator@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    await screen.findByRole('alert');
    expect(fetcher.mock.calls.some(call => call[0].endsWith('/login'))).toBe(true);
    const request = (fetcher.mock.calls as unknown as [string, RequestInit][]).find(([url]) => url.endsWith('/login'))!;
    expect(request[1].headers).toMatchObject({ 'X-CSRFToken': 'csrf-token' });
    expect(JSON.parse(request[1].body as string)).toEqual({ email: 'operator@example.com', password: 'wrong-password' });
  });

  it('조회 전용 운영자는 메뉴를 확인할 수 있지만 수정 버튼은 없다', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/session') ? respond({ authenticated: true, username: 'reader', csrf: 'token', permissions: ['catalog.view_menu'] }) : respond({ total: 1, results: [{ id: 'm1', name: '테스트 메뉴', description: '설명', price_amount: 5000, category: '한식', sale_status: 'available', restaurant_name: '매장' }] })));
    mount('/manage/menus');
    await screen.findByText('테스트 메뉴');
    fireEvent.click(screen.getByRole('button', { name: '열기' }));
    expect(screen.getByLabelText('메뉴명').hasAttribute('disabled')).toBe(false);
    expect((screen.getByLabelText('메뉴명').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
    expect(screen.queryByRole('link', { name: '리뷰 관리' })).toBeNull();
  });

  it('메뉴 수정 시 허용된 필드만 PATCH 요청한다', async () => {
    const fetcher = vi.fn((url: string, options?: RequestInit) => url.endsWith('/session') ? respond({ authenticated: true, username: 'operator', csrf: 'token', permissions: ['catalog.view_menu', 'catalog.change_menu'] }) : options?.method === 'PATCH' ? respond({ id: 'm1' }) : respond({ total: 1, results: [{ id: 'm1', name: '기존 메뉴', description: '', price_amount: null, category: '', sale_status: 'unverified', restaurant_name: '매장' }] }));
    vi.stubGlobal('fetch', fetcher);
    mount('/manage/menus');
    await screen.findByText('기존 메뉴');
    fireEvent.click(screen.getByRole('button', { name: '열기' }));
    fireEvent.change(screen.getByLabelText('메뉴명'), { target: { value: '수정 메뉴' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(fetcher.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true));
    const [, options] = fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
    expect(JSON.parse(options!.body as string)).toEqual({ name: '수정 메뉴', description: '', price_amount: null, category: '' });
  });
});
