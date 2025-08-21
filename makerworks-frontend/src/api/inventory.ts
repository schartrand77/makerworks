// src/api/inventory.ts
// One client for BOTH user-inventory and admin inventory (levels + moves)
import http from '@/api/client'
import qs from 'qs'

/** Utility to serialize query params (skips null/empty). */
function withQS(params?: Record<string, any>) {
  return {
    params,
    paramsSerializer: {
      serialize: (p: any) =>
        qs.stringify(
          Object.fromEntries(
            Object.entries(p ?? {}).filter(([, v]) => v !== '' && v != null)
          ),
          { skipNulls: true, arrayFormat: 'repeat' }
        ),
    },
    withCredentials: true,
  } as const
}

/* ──────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────── */

export type Paginated<T> = {
  items: T[]
  total?: number
  page?: number
  page_size?: number
}

export interface UserItem {
  id: string
  variant_id: string
  qty: number
  cost_cents: number
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface InventoryLevel {
  variant_id: string
  warehouse_id: string
  on_hand: number
  reserved: number
  created_at?: string | null
  updated_at?: string | null
}

export interface StockMove {
  id: string
  variant_id: string
  warehouse_id: string
  qty: number
  type: string
  note?: string | null
  created_at?: string | null
}

/* Optional convenience types if you wire product/warehouse dropdowns later */
export interface Warehouse {
  id: string
  name: string
}
export interface ProductVariant {
  id: string
  sku?: string | null
  name?: string | null
}

/* ──────────────────────────────────────────────
 * USER INVENTORY (/api/v1/user/inventory)
 * ────────────────────────────────────────────── */

/** GET /api/v1/user/inventory */
export async function listUserItems(params?: {
  page?: number
  page_size?: number
  q?: string
}) {
  const { data } = await http.get('/api/v1/user/inventory', withQS(params))
  // backend returns { items, total, page, page_size }
  return data as Paginated<UserItem>
}

/** POST /api/v1/user/inventory */
export async function addUserItem(payload: {
  variant_id: string
  qty?: number
  cost_cents?: number
  notes?: string
}) {
  const { data } = await http.post('/api/v1/user/inventory', payload, {
    withCredentials: true,
  })
  // typically { id }
  return data as { id: string }
}

/** PATCH /api/v1/user/inventory/{id} */
export async function updateUserItem(
  id: string,
  payload: Partial<{
    qty: number
    cost_cents: number
    notes: string
  }>
) {
  const { data } = await http.patch(`/api/v1/user/inventory/${id}`, payload, {
    withCredentials: true,
  })
  return data as { status: 'ok' }
}

/** DELETE /api/v1/user/inventory/{id} */
export async function deleteUserItem(id: string) {
  const { data } = await http.delete(`/api/v1/user/inventory/${id}`, {
    withCredentials: true,
  })
  return data as { status: 'ok' }
}

/* ──────────────────────────────────────────────
 * ADMIN INVENTORY (/api/v1/inventory/*)
 * Levels + Moves
 * ────────────────────────────────────────────── */

/** GET /api/v1/inventory/levels */
export async function listLevels(params?: {
  page?: number
  page_size?: number
  variant_id?: string
  warehouse_id?: string
}) {
  const { data } = await http.get('/api/v1/inventory/levels', withQS(params))
  // Some backends return a plain array; normalize to { items, total }
  if (Array.isArray(data)) {
    return { items: data as InventoryLevel[], total: (data as any[]).length } satisfies Paginated<InventoryLevel>
  }
  return data as Paginated<InventoryLevel>
}

/** PATCH /api/v1/inventory/levels (upsert) */
export async function upsertLevel(payload: {
  variant_id: string
  warehouse_id: string
  on_hand?: number
  reserved?: number
}) {
  const { data } = await http.patch('/api/v1/inventory/levels', payload, {
    withCredentials: true,
  })
  return data as InventoryLevel
}

/** GET /api/v1/inventory/moves */
export async function listMoves(params?: {
  page?: number
  page_size?: number
  variant_id?: string
  warehouse_id?: string
  type?: string
}) {
  const { data } = await http.get('/api/v1/inventory/moves', withQS(params))
  if (Array.isArray(data)) {
    return { items: data as StockMove[], total: (data as any[]).length } satisfies Paginated<StockMove>
  }
  return data as Paginated<StockMove>
}

/** POST /api/v1/inventory/moves */
export async function createMove(payload: {
  variant_id: string
  warehouse_id: string
  qty: number
  type: string
  to_warehouse_id?: string | null
  note?: string | null
}) {
  const { data } = await http.post('/api/v1/inventory/moves', payload, {
    withCredentials: true,
  })
  return data as { status: string }
}

/* ──────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────── */

/** 409 helper for catching duplicates gracefully */
export function isConflict(err: unknown): boolean {
  return !!(err as any)?.response && (err as any).response.status === 409
}

/** 401/403 guard */
export function isAuthError(err: unknown): boolean {
  const s = (err as any)?.response?.status
  return s === 401 || s === 403
}
