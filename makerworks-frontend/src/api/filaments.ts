// src/api/filaments.ts
import client from '@/lib/client'

// Always use relative paths; the client adds /api/v1 when appropriate
const PRIMARY = '/filaments'
const FALLBACKS = [
  '/filaments/',        // trailing slash variant
  '/filament',          // singular (some backends do this for create)
  '/admin/filaments',   // admin namespace
  '/admin/filaments/',  // admin + slash
] as const

type HttpishError = any

function isRetryable(e: HttpishError) {
  const s = e?.response?.status
  return s === 404 || s === 405 // method/path mismatch only
}
function explain(e: HttpishError) {
  return e?.response?.data?.detail || e?.message || 'Request failed'
}

function clean<T extends Record<string, any>>(obj: T | undefined): Partial<T> {
  if (!obj) return {}
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = v
  }
  return out as Partial<T>
}

function logAxios(err: any, label: string) {
  const status = err?.response?.status
  const allow = err?.response?.headers?.['allow']
  const data = err?.response?.data
  // eslint-disable-next-line no-console
  console.warn('[filaments]', status ?? 'ERR', 'on', label, 'Allow:', allow ?? '(no Allow header)', data ?? '')
}

export type FilamentCreate = {
  material?: string
  category?: string // e.g. "Matte" / "Silk" / "CF"
  type?: string     // alias for category
  color_name?: string
  color_hex?: string
  price_per_kg?: number // numeric
  is_active?: boolean
  barcode?: string // optional single barcode to add
}

export type Filament = {
  id: string
  name?: string
  material?: string | null
  category?: string | null
  type?: string | null
  color_name?: string | null
  color_hex?: string | null
  color?: string | null
  hex?: string | null
  price_per_kg?: number | string | null
  pricePerKg?: number | string | null
  is_active?: boolean
  barcodes?: string[] | null
  created_at?: string
  updated_at?: string
}

export async function listFilaments(params?: {
  q?: string
  limit?: number
  offset?: number
}) {
  // GET generally works already; keep simple
  const res = await client.get(PRIMARY, { params: clean(params) })
  return res.data
}

export async function createFilament(input: FilamentCreate): Promise<Filament> {
  const payload = clean({
    material: input.material,
    category: input.category ?? input.type,
    type: input.type ?? input.category,
    color_name: input.color_name,
    color_hex: normalizeHex(input.color_hex),
    price_per_kg: input.price_per_kg,
    is_active: input.is_active ?? true,
    barcode: input.barcode?.trim(),
  })

  // eslint-disable-next-line no-console
  console.info('[filaments] POST →', PRIMARY, 'payload →', payload)

  // First attempt: PRIMARY
  try {
    const { data } = await client.post(PRIMARY, payload)
    return data
  } catch (e) {
    if (!isRetryable(e)) {
      logAxios(e, PRIMARY)
      throw e
    }
  }

  // Retry through common server variants if we got 404/405
  for (const alt of FALLBACKS) {
    try {
      // eslint-disable-next-line no-console
      console.info('[filaments] retry POST →', alt)
      const { data } = await client.post(alt, payload)
      return data
    } catch (e) {
      if (!isRetryable(e)) {
        logAxios(e, alt)
        throw e
      }
      // keep looping on 404/405
    }
  }

  // If we’re here, every candidate was 404/405
  const err = new Error('No POST route found for filaments (tried multiple paths).')
  ;(err as any).hint = {
    tried: [PRIMARY, ...FALLBACKS],
    fix: 'Verify the backend exposes POST at /api/v1/filaments (or update the frontend mapping).',
  }
  throw err
}

export async function updateFilament(
  id: string,
  changes: Partial<{
    material: string
    category: string
    type: string
    color_name: string
    color_hex: string
    price_per_kg: number
    is_active: boolean
  }>
) {
  const url = `${PRIMARY}/${encodeURIComponent(id)}`
  const payload = clean({ ...changes, color_hex: normalizeHex(changes.color_hex) })
  try {
    const { data } = await client.patch(url, payload)
    return data
  } catch (e) {
    // Try admin namespace only if we hit 404/405 (keeps real errors intact)
    if (isRetryable(e)) {
      const alt = `/admin/filaments/${encodeURIComponent(id)}`
      // eslint-disable-next-line no-console
      console.info('[filaments] retry PATCH →', alt)
      const { data } = await client.patch(alt, payload)
      return data
    }
    logAxios(e, url)
    throw e
  }
}

export async function deleteFilament(id: string) {
  const url = `${PRIMARY}/${encodeURIComponent(id)}`
  try {
    await client.delete(url)
    return { ok: true }
  } catch (e) {
    if (isRetryable(e)) {
      const alt = `/admin/filaments/${encodeURIComponent(id)}`
      // eslint-disable-next-line no-console
      console.info('[filaments] retry DELETE →', alt)
      await client.delete(alt)
      return { ok: true }
    }
    logAxios(e, url)
    throw e
  }
}

export async function addBarcode(id: string, code: string) {
  const url = `${PRIMARY}/${encodeURIComponent(id)}/barcodes`
  try {
    const { data } = await client.post(url, { code: code.trim() })
    return data
  } catch (e) {
    if (isRetryable(e)) {
      const alt = `/admin/filaments/${encodeURIComponent(id)}/barcodes`
      // eslint-disable-next-line no-console
      console.info('[filaments] retry POST →', alt)
      const { data } = await client.post(alt, { code: code.trim() })
      return data
    }
    logAxios(e, url)
    throw e
  }
}

export async function removeBarcode(id: string, code: string) {
  const url = `${PRIMARY}/${encodeURIComponent(id)}/barcodes/${encodeURIComponent(code)}`
  try {
    await client.delete(url)
    return { ok: true }
  } catch (e) {
    if (isRetryable(e)) {
      const alt = `/admin/filaments/${encodeURIComponent(id)}/barcodes/${encodeURIComponent(code)}`
      // eslint-disable-next-line no-console
      console.info('[filaments] retry DELETE →', alt)
      await client.delete(alt)
      return { ok: true }
    }
    logAxios(e, url)
    throw e
  }
}

export async function fetchAvailableFilaments() {
  const { data } = await client.get(PRIMARY)
  return data
}

// --- helpers ---
function normalizeHex(v: string | undefined): string | undefined {
  if (!v) return v
  const s = String(v).trim()
  if (!s) return undefined
  const core = s.replace(/^#+/, '')
  if (!/^[0-9A-Fa-f]{6}$/.test(core)) return s // leave weird values untouched
  return `#${core}`
}
