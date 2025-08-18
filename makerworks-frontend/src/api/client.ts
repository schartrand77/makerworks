// src/api/axios.ts
import Axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  CreateAxiosDefaults,
} from 'axios'

/**
 * Axios hardening:
 * - Force baseURL to ORIGIN-ONLY (strip any path like '/api')
 * - Ensure exactly one '/api/v1' prefix on every request path
 * - Rewrite legacy:
 *     '/users/me'                  -> '/api/v1/auth/me'
 *     '/users/:id/uploads'         -> '/api/v1/admin/users/:id/uploads'
 * - Install interceptors on all instances (global + created)
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
    // fallback: crude regex to slice at first single slash after host
    const m = u.match(/^(https?:\/\/[^/]+)(?:\/.*)?$/i)
    return m ? m[1] : u.replace(/\/+$/, '')
  }
}

const baseOrigin = originOnly(rawBase)

const DEBUG =
  ((env.DEV && env.VITE_AXIOS_DEBUG !== '0') || env.VITE_AXIOS_DEBUG === '1')

const stripSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '')

const isLoopback = (h: string) => {
  const x = h.toLowerCase()
  return x === 'localhost' || x === '127.0.0.1' || x === '::1'
}

const sameOrigin = (a: URL, b: URL) => a.protocol === b.protocol && a.host === b.host

function shouldRewriteAbs(abs: URL, inf: URL, page?: URL) {
  return (
    sameOrigin(abs, inf) ||
    (page && sameOrigin(abs, page)) ||
    isLoopback(abs.hostname)
  )
}

/** Ensure exactly one '/api/v1' prefix */
function prefixPath(pathname: string) {
  const clean = '/' + stripSlashes(pathname)
  const pref = '/' + stripSlashes(API_PREFIX)
  if (clean === pref) return pref + '/'
  if (clean.startsWith(pref + '/')) return clean
  return pref + clean
}

/**
 * Rewrite legacy paths to spec-correct ones.
 * - '/api/v1/users/me'           -> '/api/v1/auth/me'
 * - '/api/v1/users/:id/uploads'  -> '/api/v1/admin/users/:id/uploads'
 */
function rewriteLegacyPaths(pathname: string): string {
  const withPrefix = (pathname.startsWith('/api/v1/') ? pathname : prefixPath(pathname)).replace(/\/{2,}/g, '/')

  // /api/v1/users/me  -> /api/v1/auth/me
  if (/^\/api\/v1\/users\/me\/?$/i.test(withPrefix)) {
    return '/api/v1/auth/me'
  }

  // /api/v1/users/:id/uploads -> /api/v1/admin/users/:id/uploads
  const up = withPrefix.match(/^\/api\/v1\/users\/([^/]+)\/uploads\/?$/i)
  if (up) {
    const id = decodeURIComponent(up[1])
    return `/api/v1/admin/users/${encodeURIComponent(id)}/uploads`
  }

  return withPrefix
}

/** Normalizer for ABSOLUTE URLs */
function normalizeAbsolute(u: URL) {
  const inf = new URL(baseOrigin)
  const page = typeof window !== 'undefined' ? new URL(window.location.origin) : undefined
  if (!shouldRewriteAbs(u, inf, page)) return u.toString()

  u.pathname = prefixPath(u.pathname)
  u.pathname = rewriteLegacyPaths(u.pathname)
  u.pathname = u.pathname.replace(/\/{2,}/g, '/')
  return u.toString()
}

/** Normalizer for RELATIVE URLs */
function normalizeRelative(url: string) {
  let path = prefixPath(url)
  path = rewriteLegacyPaths(path)
  return path.replace(/\/{2,}/g, '/')
}

function ensureVersioned(url: string) {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) {
    try {
      return normalizeAbsolute(new URL(url))
    } catch {
      // fall through to relative handling if URL ctor croaks
    }
  }
  return normalizeRelative(url)
}

/** Last-chance fixer for obvious legacy forms */
function forceFixCommon(u: string) {
  // Absolute?
  if (/^https?:\/\//i.test(u)) {
    try {
      const abs = new URL(u)
      if (/^\/users\/me\/?$/i.test(abs.pathname)) {
        abs.pathname = '/api/v1/auth/me'
        return abs.toString()
      }
      const m = abs.pathname.match(/^\/users\/([^/]+)\/uploads\/?$/i)
      if (m) {
        const id = decodeURIComponent(m[1])
        abs.pathname = `/api/v1/admin/users/${encodeURIComponent(id)}/uploads`
        return abs.toString()
      }
      return u
    } catch {
      return u
    }
  }

  // Relative
  if (/^\/?users\/me\/?$/i.test(u)) return '/api/v1/auth/me'
  const n = u.replace(/^\//, '').match(/^users\/([^/]+)\/uploads\/?$/i)
  if (n) return `/api/v1/admin/users/${encodeURIComponent(decodeURIComponent(n[1]))}/uploads`
  return u
}

function fullUrl(u: string) {
  return /^https?:\/\//i.test(u)
    ? u
    : `${baseOrigin.replace(/\/+$/, '')}/${u.replace(/^\/+/, '')}`
}

// ──────────────────────────────────────────────────────────────────────────────
// Install interceptors on any instance (HMR safe)
// ──────────────────────────────────────────────────────────────────────────────
function installInterceptors(instance: AxiosInstance) {
  const tag = '__mw_prefix_installed__'
  const inst = instance as AxiosInstance & Record<string, unknown>
  if (inst[tag]) return
  inst[tag] = true

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const original = config.url ?? ''
    // Normalize path (adds /api/v1, rewrites legacy)
    let fixed = ensureVersioned(original)
    // Final guard
    fixed = forceFixCommon(fixed)
    config.url = fixed

    // Base URL MUST be origin-only; if someone snuck a path in, nuke it.
    // @ts-expect-error - axios allows string
    config.baseURL = baseOrigin

    // Always send cookies; server uses Redis session
    config.withCredentials = true
    config.headers = { Accept: 'application/json', ...(config.headers || {}) }

    if (DEBUG) {
      console.info(
        '[axios]',
        (config.method || 'GET').toUpperCase(),
        'orig→fixed:',
        fullUrl(String(original)),
        '→',
        fullUrl(String(fixed))
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
        console.warn('[axios:error]', s, fullUrl(reqUrl), err?.response?.data ?? '')
      }
      return Promise.reject(err)
    }
  )
}

// ──────────────────────────────────────────────────────────────────────────────
export function createApiClient(
  config?: CreateAxiosDefaults
): AxiosInstance {
  const inst = Axios.create({
    baseURL: baseOrigin, // ORIGIN ONLY — no path here
    withCredentials: true,
    headers: { Accept: 'application/json' },
    timeout: 30000,
    ...(config || {}),
  })

  // Force origin-only even if a path sneaks into config.baseURL
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
