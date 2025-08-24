// tiny, safe HTTP helper; no cursed backticks
export async function j<T>(p: Promise<Response>): Promise<T> {
  const r = await p;
  if (!r.ok) {
    let extra = '';
    try {
      const t = await r.text();
      extra = t ? ` - ${t}` : '';
    } catch {/* ignore */}
    throw new Error(`${r.status} ${r.statusText}${extra}`);
  }
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return (await r.json()) as T;
  }
  return (await r.text()) as unknown as T;
}

export const BACKEND = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');
export const API     = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');
