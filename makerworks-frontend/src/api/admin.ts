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

import axios from './axios'

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
function ok<S = any>(res: { status: number; data: S }) {
  if (res.status >= 200 && res.status < 300) return res.data
  const detail =
    (res as any)?.data?.detail ??
    (Array.isArray((res as any)?.data?.detail) ? (res as any).data.detail[0]?.msg : undefined)
  throw new Error(detail || `Admin API error (${res.status})`)
}

const tolerant = {
  // allow 4xx so we can surface backend messages if needed
  status: (s: number) => (s >= 200 && s < 300) || (s >= 400 && s < 500),
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
  params?: Record<string, any>
): Promise<AdminUser[]> {
  try {
    const res = await axios.get<AdminUser[]>('/admin/users', {
      params,
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    return ok(res)
  } catch (err) {
    console.error('[Admin] Failed to fetch users:', err)
    throw err
  }
}

// Alias name kept (calls demote per server API)
export async function banUser(userId: string): Promise<void> {
  try {
    const res = await axios.post(`/admin/users/${userId}/demote`, null, {
      withCredentials: true,
      validateStatus: tolerant.status,
    })
    ok(res)
  } catch (err) {
    console.error(`[Admin] Failed to ban user ${userId}:`, err)
    throw err
  }
}

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
  params?: Record<string, any>
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
  banUser,
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
