let csrf = '';
export class ManageError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function manageApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/manage/${path}`, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(method !== 'GET' ? { 'X-CSRFToken': csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ message: '서버 응답을 확인할 수 없습니다.' }));
  if (!response.ok) throw new ManageError(data.message || '요청을 처리하지 못했습니다.', response.status);
  if (data.csrf) csrf = data.csrf;
  return data as T;
}
