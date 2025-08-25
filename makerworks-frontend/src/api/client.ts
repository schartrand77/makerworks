// src/api/client.ts
import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  CreateAxiosDefaults,
} from 'axios';

/**
 * MakerWorks Axios client (fixed)
 * - baseURL is the ORIGIN ONLY (no /api/v1) to avoid double-prefix bugs
 * - Interceptor normalizes request URLs:
 *    • same-origin absolute → relative
 *    • if path already starts with /api/v1 → leave it
 *    • if path looks like an API route (e.g. /auth, /users, /filaments, …) → prefix /api/v1
 *    • everything else (e.g. /VERSION, /_health) → leave as-is
 * - Also sanitizes PATCH /api/v1/users/me
 */

type AnyEnv = Record<string, any>;
const ENV = (import.meta.env || {}) as AnyEnv;
const DEBUG =
  ((ENV?.DEV && ENV?.VITE_AXIOS_DEBUG !== '0') || ENV?.VITE_AXIOS_DEBUG === '1');

// Resolve base origin (no path)
function originOnly(u: string): string {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}`; // strip path/query/hash
  } catch {
    return String(u).replace(/\/+$/, '');
  }
}

function deriveOrigin(): string {
  const raw =
    (ENV.VITE_API_BASE as string) ||
    (ENV.VITE_API_BASE_URL as string) ||
    (ENV.VITE_API_ORIGIN as string) ||
    (typeof window !== 'undefined'
      ? window.location.origin.replace(':5173', ':8000')
      : 'http://localhost:8000');
  return originOnly(raw);
}

const BASE_ORIGIN = deriveOrigin();

const LOOPBACKS = new Set(['localhost', '127.0.0.1', '::1']);
const stripEdgeSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '');

function sameOrigin(a: URL, b: URL) {
  return a.protocol === b.protocol && a.host === b.host;
}

/** Convert same-origin absolute → relative path (so baseURL handles host) */
function toRelativeIfSameOrigin(input: string): string {
  if (!/^https?:\/\//i.test(input)) return input; // already relative
  try {
    const abs = new URL(input);
    const base = new URL(BASE_ORIGIN);
    const page =
      typeof window !== 'undefined' ? new URL(window.location.origin) : undefined;
    if (sameOrigin(abs, base) || (page && sameOrigin(abs, page)) || LOOPBACKS.has(abs.hostname.toLowerCase())) {
      return abs.pathname + abs.search + abs.hash;
    }
    // Different origin — leave absolute untouched
    return input;
  } catch {
    return input;
  }
}

/** Decide whether we should auto-prefix /api/v1 for a given path */
function needsApiPrefix(path: string): boolean {
  // If already versioned or explicitly under /api, do not touch
  if (/^\/api\/v\d+\//i.test(path)) return false;
  if (/^\/api\//i.test(path)) return false;

  // Known API root segments under our v1
  // (Keep this list generous; unknowns won't be auto-prefixed.)
  const apiRoots = [
    'auth',
    'users',
    'admin',
    'filaments',
    'printers',
    'inventory',
    'estimates',
    'system',
    'cart',
    'carts',
    'materials',
    'tiers',
    'labor-roles',
    'process-steps',
    'consumables',
    'rules',
    'uploads',
    'models',
    'themes',
  ];

  const seg = path.replace(/^\/+/, '').split(/[/?#]/, 1)[0].toLowerCase();
  return apiRoots.includes(seg);
}

/** Normalize a request URL (relative/absolute → final path) */
function normalizeUrl(u: string | undefined | null): string {
  const raw = (u ?? '').toString().trim();
  if (!raw) return '/';

  // 1) same-origin absolute → relative
  let rel = toRelativeIfSameOrigin(raw);

  // 2) ensure leading slash for relative URLs
  if (!/^https?:\/\//i.test(rel)) {
    rel = '/' + stripEdgeSlashes(rel);
  }

  // 3) If it looks like an API route but lacks /api/v1, prefix it
  if (needsApiPrefix(rel)) {
    rel = '/api/v1' + (rel === '/' ? '' : rel);
  }

  // 4) collapse any accidental doubles
  rel = rel.replace(/\/{2,}/g, '/');
  return rel;
}

/** ==== SPECIAL: sanitize PATCH /api/v1/users/me body to avoid 422 ==== */
const USERS_ME_ALLOWED = new Set(['name', 'bio', 'avatar_url', 'language', 'theme']);
function emptyToNull(v: any) {
  return v === '' ? null : v;
}
function normalizeTheme(v: any): 'light' | 'dark' | null | undefined {
  if (v == null) return null;
  const t = String(v).toLowerCase();
  return t === 'dark' ? 'dark' : t === 'light' ? 'light' : null;
}
function sanitizeUsersMeBody(data: any): any {
  // Plain object
  if (data && typeof data === 'object' && !(data instanceof FormData)) {
    const out: Record<string, any> = {};
    for (const k of USERS_ME_ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        out[k] = k === 'theme' ? normalizeTheme(data[k]) : emptyToNull(data[k]);
      }
    }
    return out;
  }
  // JSON string
  if (typeof data === 'string') {
    try {
      return sanitizeUsersMeBody(JSON.parse(data));
    } catch {
      return data;
    }
  }
  // FormData
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    const fd = new FormData();
    for (const k of USERS_ME_ALLOWED) {
      if (data.has(k)) {
        const v = k === 'theme' ? normalizeTheme(data.get(k)) : emptyToNull(data.get(k));
        if (v !== undefined) fd.set(k, v as any);
      }
    }
    return fd;
  }
  return data;
}

/** Install interceptors onto an axios instance (idempotent) */
function installInterceptors(instance: AxiosInstance) {
  const tag = '__mw_interceptors_installed__';
  const inst = instance as AxiosInstance & Record<string, unknown>;
  if (inst[tag]) return;
  inst[tag] = true;

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    // Normalize URL
    const finalUrl = normalizeUrl(config.url);

    // Apply base origin only; no /api/v1 here
    config.baseURL = BASE_ORIGIN;
    config.url = finalUrl;
    config.withCredentials = true;
    config.headers = { Accept: 'application/json', ...(config.headers || {}) };

    // PATCH /users/me sanitizer
    const method = (config.method || 'get').toUpperCase();
    if (method === 'PATCH' && /^\/api\/v1\/users\/me\/?$/.test(finalUrl)) {
      config.data = sanitizeUsersMeBody(config.data);
      if (config.data && !(config.data instanceof FormData)) {
        (config.headers as any)['Content-Type'] = 'application/json';
      }
    }

    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.info('[axios]', method, '→', (config.baseURL || '') + (config.url || ''));
    }
    return config;
  });

  instance.interceptors.response.use(
    (res) => res,
    (err: AxiosError) => {
      if (DEBUG) {
        const s = err?.response?.status;
        const reqUrl = String((err?.config?.baseURL || '') + (err?.config?.url || ''));
        // eslint-disable-next-line no-console
        console.warn('[axios:error]', s, reqUrl, err?.response?.data ?? '');
      }
      return Promise.reject(err);
    }
  );
}

/** Factory + default instance */
export function createApiClient(config?: CreateAxiosDefaults): AxiosInstance {
  const inst = axios.create({
    baseURL: BASE_ORIGIN, // origin only
    withCredentials: true,
    headers: { Accept: 'application/json' },
    timeout: 30000,
    ...(config || {}),
  });
  installInterceptors(inst);
  return inst;
}

const api: AxiosInstance = createApiClient();
export default api;
