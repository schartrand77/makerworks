// src/api/filaments.ts
// Self-contained API client (no '@/lib/client' required)

const API_BASE =
  (import.meta as any)?.env?.VITE_API_PREFIX?.toString().replace(/\/$/, '') || '/api/v1'

export type FilamentDTO = {
  id?: string
  // legacy (older backend)
  type?: string | null
  color?: string | null
  hex?: string | null
  is_active?: boolean | null
  // new (current backend)
  name?: string | null
  category?: string | null
  colorHex?: string | null
  pricePerKg?: number | null
  created_at?: string | null
  updated_at?: string | null
}

function toNum(v: any): number | undefined {
  if (v === '' || v === null || v === undefined) return undefined
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v)
  return Number.isFinite(n) ? n : undefined
}

async function http<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const headers: Record<string, string> = { 'Accept': 'application/json' }
  const init: RequestInit = {
    method,
    headers,
    credentials: 'include', // keep cookie session
  }
  if (body !== undefined) {
    ;(headers as any)['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(url, init)
  const ct = res.headers.get('content-type') || ''
  const hasJson = ct.includes('application/json')
  const data = hasJson ? await res.json() : await res.text()
  if (!res.ok) {
    // bubble up FastAPI-style error payloads
    const err: any = new Error(
      (hasJson && (data?.detail || data?.message)) ||
        `${res.status} ${res.statusText} — ${typeof data === 'string' ? data : ''}`.trim()
    )
    err.status = res.status
    err.data = data
    throw err
  }
  return data as T
}

function buildCreateBody(input: Partial<FilamentDTO>) {
  const type = (input.type ?? '').toString().trim()
  const color = (input.color ?? '').toString().trim()
  const hexRaw = (input.hex ?? input.colorHex ?? '').toString().trim()

  const name = (input.name ?? `${type} ${color}`.trim()).toString().trim()

  // avoid ?? with || (SWC gripe): compute first, then fallback
  const baseCategory = (input.category ?? type) as string | null | undefined
  const category = ((baseCategory as string) || 'Misc').toString().trim()

  const colorHex = (input.colorHex ?? hexRaw).toString().trim()
  const pricePerKg = toNum(input.pricePerKg) ?? 0
  const is_active = input.is_active ?? true

  // Superset payload so both old/new backends are happy
  const body: any = {
    // new required keys
    name,
    category,
    colorHex,
    pricePerKg,
    is_active,
    // legacy (ignored by new backend)
    type: type || undefined,
    color: color || undefined,
    hex: hexRaw || undefined,
  }
  return body
}

function buildPatchBody(input: Partial<FilamentDTO>) {
  const body: any = {}

  if (input.name != null || input.type != null || input.color != null) {
    const type = (input.type ?? '').toString().trim()
    const color = (input.color ?? '').toString().trim()
    body.name = (input.name ?? `${type} ${color}`.trim()).toString().trim()
  }

  if (input.category != null || input.type != null) {
    const categoryBase = (input.category ?? input.type ?? '').toString().trim()
    if (categoryBase) body.category = categoryBase
  }

  if (input.colorHex != null || input.hex != null) {
    const colorHex = (input.colorHex ?? input.hex ?? '').toString().trim()
    if (colorHex) body.colorHex = colorHex
  }

  if (input.pricePerKg != null) {
    const n = toNum(input.pricePerKg)
    if (n != null) body.pricePerKg = n
  }

  if (input.is_active != null) body.is_active = !!input.is_active

  // keep legacy fields (harmless if ignored)
  if (input.type != null) body.type = input.type
  if (input.color != null) body.color = input.color
  if (input.hex != null) body.hex = input.hex

  return body
}

// ---- API ----

export async function getFilaments() {
  return http('/filaments'.startsWith('/') ? 'GET' : 'GET', '/filaments')
}

export async function createFilament(input: Partial<FilamentDTO>) {
  const body = buildCreateBody(input)
  return http('POST', '/filaments', body)
}

export async function updateFilament(id: string, input: Partial<FilamentDTO>) {
  const body = buildPatchBody(input)
  return http('PATCH', `/filaments/${id}`, body)
}

export async function deleteFilament(id: string) {
  return http('DELETE', `/filaments/${id}`)
}
