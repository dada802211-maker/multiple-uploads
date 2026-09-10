import type { Archive, User } from '../types/archive';
let csrf = '';
type Result = {
  message: string;
  csrf?: string;
  user: User | null;
  archives: Archive[];
};
// Cookie認証とCSRFトークンをここに集約します。
export async function api(action: string, body?: FormData | object, id?: number): Promise<Result> {
  const response = await fetch(`/api?action=${action}${id ? `&id=${id}` : ''}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'X-CSRF-Token': csrf, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) } : {},
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({ message: 'サーバーに接続できません。容量制限や接続を確認してください。' }));
  if (!response.ok)
    throw new Error(data.message || '処理に失敗しました。');
  if (data.csrf)
    csrf = data.csrf;
  return data;
}
export async function download(id: number, name: string) {
  const response = await fetch(`/api?action=download&id=${id}`);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
