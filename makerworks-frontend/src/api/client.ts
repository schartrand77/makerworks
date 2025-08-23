// src/api/client.ts
import Axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  CreateAxiosDefaults,
} from 'axios'

/**
 * Axios hardening (MakerWorks):
 * - Origin-only baseURL (strip any path like '/api')
 * - Ensure exactly one '/api/v1' prefix on every request path
 * - Legacy rewrite kept:
 *     '/users/:id/uploads' -> '/api/v1/admin/users/:id/uploads'
 * - SPECIAL: For PATCH /api/v1/users/me, strip forbidden fields that cause 422
 */

const API_PREFIX = '/api/v1'

const env = import.meta.env as ImportMetaEnv & {
  VITE_API_BASE_URL?: string
  VITE_API_ORIGIN?: string
  VITE_AXIOS_DEBUG?: string
}

const rawBase =
  env.VITE_API_BASE_URL?.toString().trim() ||
  env.VITE_API_ORIGIN?.toString().trim() ||
  (typeof window !== 'undefined'
    ? window.location.origin.replace(':5173', ':8000')
    : 'http://localhost:8000')

function originOnly(u: string): string {
  try {
    const url = new URL(u)
    return `${url.protocol}//${url.host}` // strip any path/query/hash
  } catch {
    const m = u.match(/^(https?:\/\/[^/]+)(?:\/.*)?$/i)
    return m ? m[1] : u.replace(/\/+$/, '')
  }
}

const baseOrigin = originOnly(rawBase)
const DEBUG =
  ((env.DEV && env.VITE_AXIOS_DEBUG !== '0') || env.VITE_AXIOS_DEBUG === '1')

const stripSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '')
const isLoopback = (h: string) => ['localhost', '127.0.0.1', '::1'].includes(h.toLowerCase())
const sameOrigin = (a: URL, b: URL) => a.protocol === b.protocol && a.host === b.host

function shouldRewriteAbs(abs: URL, inf: URL, page?: URL) {
  return sameOrigin(abs, inf) || (page && sameOrigin(abs, page)) || isLoopback(abs.hostname)
}

/** Ensure exactly one '/api/v1' prefix */
function prefixPath(pathname: string) {
  const clean = '/' + stripSlashes(pathname)
  const pref = '/' + stripSlashes(API_PREFIX)
  if (clean === pref) return pref + '/'
  if (clean.startsWith(pref + '/')) return clean
  return pref + clean
}

/** Legacy path rewrites we still want */
function rewriteLegacyPaths(pathname: string): string {
  const withPrefix = (pathname.startsWith('/api/v1/') ? pathname : prefixPath(pathname)).replace(/\/{2,}/g, '/')

  // /api/v1/users/:id/uploads -> /api/v1/admin/users/:id/uploads
  const up = withPrefix.match(/^\/api\/v1\/users\/([^/]+)\/uploads\/?$/i)
  if (up) {
    const id = decodeURIComponent(up[1])
    return `/api/v1/admin/users/${encodeURIComponent(id)}/uploads`
  }

  return withPrefix
}

/** Absolute URL normalization */
function normalizeAbsolute(u: URL) {
  const inf = new URL(baseOrigin)
  const page = typeof window !== 'undefined' ? new URL(window.location.origin) : undefined
  if (!shouldRewriteAbs(u, inf, page)) return u.toString()

  u.pathname = prefixPath(u.pathname)
  u.pathname = rewriteLegacyPaths(u.pathname)
  u.pathname = u.pathname.replace(/\/{2,}/g, '/')
  return u.toString()
}

/** Relative URL normalization */
function normalizeRelative(url: string) {
  let path = prefixPath(url)
  path = rewriteLegacyPaths(path)
  return path.replace(/\/{2,}/g, '/')
}

function ensureVersioned(url: string) {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) {
    try { return normalizeAbsolute(new URL(url)) } catch { /* fallthrough */ }
  }
  return normalizeRelative(url)
}

/** Last-chance fixer for obvious legacy forms (uploads only) */
function forceFixCommon(u: string) {
  // Absolute?
  if (/^https?:\/\//i.test(u)) {
    try {
      const abs = new URL(u)
      const m = abs.pathname.match(/^\/users\/([^/]+)\/uploads\/?$/i)
      if (m) {
        const id = decodeURIComponent(m[1])
        abs.pathname = `/api/v1/admin/users/${encodeURIComponent(id)}/uploads`
        return abs.toString()
      }
      return u
    } catch { return u }
  }
  // Relative uploads form
  const n = u.replace(/^\//, '').match(/^users\/([^/]+)\/uploads\/?$/i)
  if (n) return `/api/v1/admin/users/${encodeURIComponent(decodeURIComponent(n[1]))}/uploads`
  return u
}

function fullUrl(u: string) {
  return /^https?:\/\//i.test(u)
    ? u
    : `${baseOrigin.replace(/\/+$/, '')}/${u.replace(/^\/+/, '')}`
}

/** ==== SPECIAL: sanitize PATCH /api/v1/users/me body to avoid 422 ==== */
const USERS_ME_ALLOWED = new Set(['name', 'bio', 'avatar_url', 'language', 'theme'])

function emptyToNull(v: any) {
  return v === '' ? null : v
}

function normalizeTheme(v: any): 'light' | 'dark' | null | undefined {
  if (v == null) return null
  const t = String(v).toLowerCase()
  return t === 'dark' ? 'dark' : t === 'light' ? 'light' : null
}

function sanitizeUsersMeBody(data: any): any {
  // JSON object (common path)
  if (data && typeof data === 'object' && !(data instanceof FormData)) {
    const out: Record<string, any> = {}
    for (const k of USERS_ME_ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        if (k === 'theme') out.theme = normalizeTheme(data.theme)
        else out[k] = emptyToNull(data[k])
      }
    }
    return out
  }

  // JSON string
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return sanitizeUsersMeBody(parsed)
    } catch {
      // opaque body — let it pass (backend will 422 if truly invalid)
      return data
    }
  }

  // FormData
  if (data instanceof FormData) {
    const fd = new FormData()
    for (const k of USERS_ME_ALLOWED) {
      if (data.has(k)) {
        const v = k === 'theme' ? normalizeTheme(data.get(k)) : emptyToNull(data.get(k))
        if (v !== undefined) fd.set(k, v as any)
      }
    }
    return fd
  }

  return data
}

/** Install interceptors on any instance (HMR-safe) */
function installInterceptors(instance: AxiosInstance) {
  const tag = '__mw_prefix_installed__'
  const inst = instance as AxiosInstance & Record<string, unknown>
  if (inst[tag]) return
  inst[tag] = true

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const original = config.url ?? ''

    // Normalize path (adds /api/v1, rewrites legacy)
    let fixed = ensureVersioned(original)
    fixed = forceFixCommon(fixed)
    config.url = fixed

    // Force origin-only base
    // @ts-expect-error axios allows string
    config.baseURL = baseOrigin

    // Cookies + default accept
    config.withCredentials = true
    config.headers = { Accept: 'application/json', ...(config.headers || {}) }

    // Transport-level payload sanitizer for PATCH /api/v1/users/me
    const method = (config.method || 'GET').toUpperCase()
    const path = new URL(fullUrl(String(fixed))).pathname
    if (method === 'PATCH' && /^\/api\/v1\/users\/me\/?$/.test(path)) {
      config.data = sanitizeUsersMeBody(config.data)
      // Ensure JSON header for objects; axios will stringify
      if (config.data && !(config.data instanceof FormData)) {
        (config.headers as any)['Content-Type'] = 'application/json'
      }
    }

    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.info(
        '[axios]',
        `– "${method}" – "orig→fixed:" – "${fullUrl(String(original))}" – "→" – "${fullUrl(String(fixed))}"`
      )
    }
    return config
  })

  instance.interceptors.response.use(
    (res) => res,
    (err: AxiosError) => {
      if (DEBUG) {
        const s = err?.response?.status
        const reqUrl = String(err?.config?.url ?? '')
        // eslint-disable-next-line no-console
        console.warn('[axios:error]', s, fullUrl(reqUrl), err?.response?.data ?? '')
      }
      return Promise.reject(err)
    }
  )
}

/** Factory + default instance */
export function createApiClient(config?: CreateAxiosDefaults): AxiosInstance {
  const inst = Axios.create({
    baseURL: baseOrigin, // origin only
    withCredentials: true,
    headers: { Accept: 'application/json' },
    timeout: 30000,
    ...(config || {}),
  })

  // Sanitize any pathy baseURL someone set
  if (inst.defaults.baseURL) {
    try {
      inst.defaults.baseURL = originOnly(String(inst.defaults.baseURL))
    } catch {
      inst.defaults.baseURL = baseOrigin
    }
  }

  installInterceptors(inst)
  return inst
}

const api: AxiosInstance = createApiClient()
export default api
