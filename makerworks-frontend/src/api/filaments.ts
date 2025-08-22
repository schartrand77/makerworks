// src/api/filaments.ts
// Self-contained API client for Filaments (no external axios/client needed)

type Primitive = string | number | boolean | null | undefined;

const RAW_PREFIX =
  (import.meta as any)?.env?.VITE_API_PREFIX ??
  (import.meta as any)?.env?.VITE_API_BASE ??
  '/api/v1';

const API_PREFIX = String(RAW_PREFIX).replace(/\/+$/, ''); // trim trailing slash

// ---------------------------------------------------------
// Types
// ---------------------------------------------------------
export type FilamentDTO = {
  id?: string;

  // legacy (older backend fields)
  type?: string | null;
  color?: string | null;
  hex?: string | null;
  is_active?: boolean | null;

  // current backend fields
  name?: string | null;
  category?: string | null;
  colorHex?: string | null;
  colorName?: string | null;
  pricePerKg?: number | null;

  // metadata (server-filled)
  created_at?: string | null;
  updated_at?: string | null;
};

export type ListOptions = {
  search?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

export type CreateOptions = {
  signal?: AbortSignal;
};

export type UpdateOptions = {
  signal?: AbortSignal;
};

export type DeleteOptions = {
  signal?: AbortSignal;
};

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
function toNum(v: any): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normHex(s: Primitive): string | undefined {
  if (s == null) return undefined;
  const t = String(s).trim();
  if (!t) return undefined;
  return t.startsWith('#') ? t.toUpperCase() : `#${t.toUpperCase()}`;
}

function qs(params: Record<string, Primitive>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.append(k, String(v));
  }
  const q = usp.toString();
  return q ? `?${q}` : '';
}

async function http<T = any>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const url = `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = {
    method,
    headers,
    credentials: 'include', // keep cookie session
    signal,
  };

  if (body !== undefined) {
    if (body instanceof FormData) {
      // Let the browser set multipart boundary
      delete (headers as any)['Content-Type'];
      init.body = body;
    } else {
      (headers as any)['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, init);
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  const payload = res.status === 204 ? null : isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg =
      (isJson && (payload as any)?.detail) ||
      (isJson && (payload as any)?.message) ||
      `${res.status} ${res.statusText}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.data = payload;
    throw err;
  }

  return payload as T;
}

// ---------------------------------------------------------
// Body builders (tolerant of legacy/new backends)
// ---------------------------------------------------------
function buildCreateBody(input: Partial<FilamentDTO>) {
  const type = (input.type ?? '').toString().trim();
  const color = (input.color ?? input.colorName ?? '').toString().trim();
  const hexRaw = normHex(input.hex ?? input.colorHex);

  const baseCategory = (input.category ?? type)?.toString().trim();
  const category = baseCategory && baseCategory.length ? baseCategory : 'Misc';

  // If no explicit name, derive "PLA Orange" style from category + color
  const derivedName = [category, color].filter(Boolean).join(' ').trim();
  const name = (input.name ?? derivedName).toString().trim();

  const pricePerKg = toNum(input.pricePerKg);
  const is_active = input.is_active ?? true;

  // Superset payload to satisfy both old and new servers
  const body: any = {
    // new
    name,
    category,
    colorHex: hexRaw,
    pricePerKg: pricePerKg ?? 0,
    is_active,
    colorName: color || undefined,

    // legacy (ignored by new backend; accepted by old)
    type: type || undefined,
    color: color || undefined,
    hex: hexRaw,
  };

  return body;
}

function buildPatchBody(input: Partial<FilamentDTO>) {
  const body: any = {};

  // name derivation if any of its parts changed
  if (input.name != null || input.type != null || input.color != null || input.category != null) {
    const type = (input.type ?? '').toString().trim();
    const color = (input.color ?? input.colorName ?? '').toString().trim();
    const category = (input.category ?? '').toString().trim();
    const defaultName = [category || type, color].filter(Boolean).join(' ').trim();
    const finalName = (input.name ?? defaultName).toString().trim();
    if (finalName) body.name = finalName;
  }

  if (input.category != null || input.type != null) {
    const c = (input.category ?? input.type ?? '').toString().trim();
    if (c) body.category = c;
  }

  if (input.colorHex != null || input.hex != null) {
    const hx = normHex(input.colorHex ?? input.hex);
    if (hx) body.colorHex = hx;
  }

  if (input.color != null || input.colorName != null) {
    const cn = (input.color ?? input.colorName ?? '').toString().trim();
    if (cn) body.colorName = cn;
  }

  if (input.pricePerKg != null) {
    const n = toNum(input.pricePerKg);
    if (n != null) body.pricePerKg = n;
  }

  if (input.is_active != null) body.is_active = !!input.is_active;

  // keep legacy mirrors (harmless if ignored)
  if (input.type != null) body.type = input.type;
  if (input.color != null) body.color = input.color;
  if (input.hex != null) body.hex = input.hex;

  return body;
}

// ---------------------------------------------------------
// API
// ---------------------------------------------------------
export async function getFilaments(opts: ListOptions = {}) {
  const { search, includeInactive, page, pageSize, signal } = opts;
  // Server expects: include_inactive, page, page_size
  const q = qs({
    search,
    include_inactive: includeInactive ? 'true' : undefined,
    page,
    page_size: pageSize,
  });
  return http<FilamentDTO[]>('GET', `/filaments${q}`, undefined, signal);
}

export async function getFilament(id: string, opts: { signal?: AbortSignal } = {}) {
  return http<FilamentDTO>('GET', `/filaments/${id}`, undefined, opts.signal);
}

export async function createFilament(input: Partial<FilamentDTO>, opts: CreateOptions = {}) {
  const body = buildCreateBody(input);
  return http<FilamentDTO>('POST', '/filaments', body, opts.signal);
}

export async function updateFilament(id: string, input: Partial<FilamentDTO>, opts: UpdateOptions = {}) {
  const body = buildPatchBody(input);
  return http<FilamentDTO>('PATCH', `/filaments/${id}`, body, opts.signal);
}

export async function deleteFilament(id: string, opts: DeleteOptions = {}) {
  // backend returns 204
  await http<void>('DELETE', `/filaments/${id}`, undefined, opts.signal);
  return;
}
