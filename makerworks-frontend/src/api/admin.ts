// src/api/admin.ts
// Admin API client — aligned to backend routes (no trailing slashes)
//
// Server routes (from your list):
// GET    /api/v1/admin/me
// GET    /api/v1/admin/users
// POST   /api/v1/admin/users/{user_id}/promote
// POST   /api/v1/admin/users/{user_id}/demote
// DELETE /api/v1/admin/users/{user_id}
// GET    /api/v1/admin/users/{user_id}/uploads
// GET    /api/v1/admin/discord/config
// POST   /api/v1/admin/discord/config
//
// NOTE: Our axios instance already targets the correct base (adds /api/v1).
// Use paths beginning with /admin/... here.

import axios from './client'

export {
  fetchAvailableFilaments,
  addFilament,
  updateFilament,
  deleteFilament,
  type Filament,
  type NewFilament,
  type UpdateFilament,
} from './filaments'

/**
 * TYPES
 */
export interface AdminUser {
  id: string
  username: string
  email: string
  banned?: boolean
  role?: string
  groups?: string[]
  name?: string | null
  is_verified?: boolean
  is_active?: boolean
  avatar_url?: string | null
  created_at?: string
  last_login?: string | null
}

export interface AdminMe {
  id: string
  email: string
  username: string
  role: string | { name: string } | string[]
  permissions?: string[]
}

export interface UploadItem {
  id: string
  path: string
  url?: string
  kind?: string
  size_bytes?: number
  created_at?: string
}

export interface DiscordConfig {
  webhook_url?: string
  enabled?: boolean
  channel?: string
  // keep loose for future fields
  [k: string]: unknown
}

export interface Model {
  id: string
  name: string
  description?: string
}

/**
 * HELPERS
 */
function ok<S = unknown>(res: { status: number; statusText?: string; data: unknown }): S {
  const { status, statusText, data } = res

  if (status >= 200 && status < 300) return data as S

  // Try to surface FastAPI-style error details
  const d = data as { detail?: unknown }
  let msg: string | undefined

  if (d?.detail) {
    if (Array.isArray(d.detail)) {
      // FastAPI 422: [{loc, msg, type}, ...]
      msg = d.detail
        .map((e: { msg?: unknown }) =>
          typeof e?.msg === 'string' ? e.msg : JSON.stringify(e)
        )
        .join('; ')
    } else if (typeof d.detail === 'string') {
      msg = d.detail
    }
  }

  if (!msg) {
    try {
      msg = typeof d === 'string' ? d : JSON.stringify(d)
    } catch {
      msg = 'Request failed'
    }
  }

  throw new Error(`${status} ${statusText || ''}${msg ? ' – ' + msg : ''}`.trim())
}

const tolerant = {
  // Allow 4xx so ok() can parse server error bodies
  status: (s: number) => (s >= 200 && s < 300) || (s >= 400 && s < 500),
}

// Scrub query params so we never send "", null, undefined, or NaN
function sanitizeParams<T extends Record<string, unknown> | undefined>(params: T): T {
  if (!params) return params
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === '' || v === null || v === undefined) continue
    if (typeof v === 'number' && !Number.isFinite(v)) continue
    out[k] = v
  }
  return out as T
}

/**
 * ADMIN: SELF
 */
export async function getAdminMe(): Promise<AdminMe> {
  const res = await axios.get<AdminMe>('/admin/me', {
    withCredentials: true,
    validateStatus: tolerant.status,
  })
  return ok(res)
}

/**
 * USERS
 */
export async function fetchAllUsers(
  params?: { limit?: number; offset?: number }
): Promise<AdminUser[]> {
  try {
    const clean = sanitizeParams(params)
    const res = await axios.get<AdminUser[]>('/admin/users', {
      params: clean,
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    return ok(res)
  } catch (err) {
    console.error('[Admin] Failed to fetch users:', err)
    throw err
  }
}

export async function demoteUser(userId: string): Promise<void> {
  try {
    const res = await axios.post(`/admin/users/${userId}/demote`, null, {
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    ok(res)
  } catch (err) {
    console.error(`[Admin] Failed to demote user ${userId}:`, err)
    throw err
  }
}

// keep banUser as an alias to demote to avoid breaking imports
export const banUser = demoteUser

export async function promoteUser(userId: string): Promise<void> {
  try {
    const res = await axios.post(`/admin/users/${userId}/promote`, null, {
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    ok(res)
  } catch (err) {
    console.error(`[Admin] Failed to promote user ${userId}:`, err)
    throw err
  }
}

export async function deleteUser(userId: string): Promise<void> {
  try {
    const res = await axios.delete(`/admin/users/${userId}`, {
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    ok(res)
  } catch (err) {
    console.error(`[Admin] Failed to delete user ${userId}:`, err)
    throw err
  }
}

/**
 * NOTE: Backend list doesn't include this.
 * Keeping it so existing callers don't explode; server may 404/405.
 */
export async function resetPassword(userId: string): Promise<void> {
  try {
    const res = await axios.post(`/admin/users/${userId}/reset-password`, null, {
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    ok(res)
  } catch (err) {
    console.error(`[Admin] Failed to reset password for user ${userId}:`, err)
    throw err
  }
}

/**
 * ADMIN: USER UPLOADS (admin-only)
 */
export async function getUserUploads(userId: string): Promise<UploadItem[]> {
  try {
    const res = await axios.get<UploadItem[]>(`/admin/users/${userId}/uploads`, {
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    return ok(res)
  } catch (err) {
    console.error(`[Admin] Failed to fetch uploads for user ${userId}:`, err)
    throw err
  }
}

/**
 * DISCORD CONFIG
 */
export async function getDiscordConfig(): Promise<DiscordConfig> {
  try {
    const res = await axios.get<DiscordConfig>('/admin/discord/config', {
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    return ok(res)
  } catch (err) {
    console.error('[Admin] Failed to get Discord config:', err)
    throw err
  }
}

export async function updateDiscordConfig(cfg: DiscordConfig): Promise<DiscordConfig> {
  try {
    const res = await axios.post<DiscordConfig>('/admin/discord/config', cfg, {
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    return ok(res)
  } catch (err) {
    console.error('[Admin] Failed to update Discord config:', err)
    throw err
  }
}

/**
 * MODELS
 * (Your server lists GET /models and GET /models/{model_id}.
 *  PATCH may not exist; keeping current shape to avoid breaking callers.)
 */
export async function fetchAllModels(
  params?: Record<string, unknown>
): Promise<Model[]> {
  try {
    const res = await axios.get<Model[]>('/models', {
      params,
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    return ok(res)
  } catch (err) {
    console.error('[Admin] Failed to fetch models:', err)
    throw err
  }
}

export async function updateModel(
  id: string,
  data: Partial<Model>
): Promise<Model> {
  try {
    const res = await axios.patch<Model>(`/models/${id}`, data, {
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    return ok(res)
  } catch (err) {
    console.error(`[Admin] Failed to update model ${id}:`, err)
    throw err
  }
}

/**
 * DEFAULT EXPORT (convenience / legacy imports)
 */
const adminApi = {
  // self
  getAdminMe,
  // users
  fetchAllUsers,
  demoteUser,
  banUser, // alias
  promoteUser,
  deleteUser,
  resetPassword,
  getUserUploads,
  // discord
  getDiscordConfig,
  updateDiscordConfig,
  // models
  fetchAllModels,
  updateModel,
}

export default adminApi
