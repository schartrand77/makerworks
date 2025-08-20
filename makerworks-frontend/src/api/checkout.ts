// src/api/checkout.ts
const API_BASE =
  (import.meta as any)?.env?.VITE_API_PREFIX?.toString().replace(/\/$/, '') || '/api/v1';

export type CheckoutItem = {
  name: string;
  cost: number;              // dollars; backend multiplies by 100
  model_id?: string | null;  // optional
  estimate_id?: string | null;
  // you can add qty if you later change the backend to honor it per line
};

export type CheckoutRequest = {
  description: string;
  currency: 'usd' | 'cad' | 'eur'; // align with your backend CurrencyEnum
  total_cost: number;               // dollars
  items: CheckoutItem[];
  // Optional: include any delivery/contact in metadata later if you want
};

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = { method, headers, credentials: 'include' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg =
      (isJson && (data?.detail || data?.message)) ||
      `${res.status} ${res.statusText}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export async function getMe(): Promise<any | null> {
  try {
    return await http<any>('GET', '/auth/me');
  } catch (e: any) {
    if (e?.status === 401) return null;
    throw e;
  }
}

export async function getCart(): Promise<{ items: CheckoutItem[] } | null> {
  try {
    return await http<{ items: CheckoutItem[] }>('GET', '/cart');
  } catch {
    return null; // fallback gracefully
  }
}

export async function createCheckoutSession(payload: CheckoutRequest): Promise<{ id: string; url: string }> {
  return http('POST', '/checkout/session', payload);
}
