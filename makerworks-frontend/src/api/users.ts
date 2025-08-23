// src/api/users.ts
import api from './client'

/** What the backend returns for the signed-in user (subset; add fields as needed) */
export interface UserMe {
  id: string
  email: string
  username: string
  name: string | null
  avatar: string | null
  avatar_url: string | null
  avatar_updated_at?: string | null
  bio: string | null
  language: string | null
  theme: 'light' | 'dark' | null
  role?: string | null
  is_verified?: boolean
  is_active?: boolean
  created_at?: string
  last_login?: string | null
}

/** Only fields the backend actually allows you to PATCH on /users/me */
export interface UpdateMePayload {
  name?: string | null
  bio?: string | null
  avatar_url?: string | null
  language?: string | null
  theme?: 'light' | 'dark' | null
}

/** Keys we will send to the server; everything else is dropped */
const ALLOWED_KEYS: (keyof UpdateMePayload)[] = [
  'name',
  'bio',
  'avatar_url',
  'language',
  'theme',
]

/** Coerce empty strings to null for optional text fields */
function emptyToNull<T extends string | null | undefined>(v: T): string | null | undefined {
  if (v === '') return null
  return v
}

/** Sanitize outbound PATCH body to avoid 422s */
export function sanitizeUpdateMe(input: Record<string, any>): UpdateMePayload {
  const out: UpdateMePayload = {}
  for (const k of ALLOWED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, k)) {
      // coerce empties on string-ish fields
      if (k === 'name' || k === 'bio' || k === 'avatar_url' || k === 'language') {
        // @ts-expect-error runtime coercion
        out[k] = emptyToNull(input[k])
      } else if (k === 'theme') {
        const t = String(input[k] ?? '').toLowerCase()
        out.theme = t === 'dark' ? 'dark' : t === 'light' ? 'light' : null
      }
    }
  }
  return out
}

/** GET /api/v1/users/me */
export async function getMe(): Promise<UserMe> {
  const res = await api.get('/users/me')
  return res.data as UserMe
}

/** PATCH /api/v1/users/me — send only allowed, sanitized fields */
export async function updateMe(partial: Record<string, any>): Promise<UserMe> {
  const body = sanitizeUpdateMe(partial)

  // If caller passed garbage only, avoid a 422 from an empty payload by throwing early
  if (Object.keys(body).length === 0) {
    throw new Error('Nothing to update: provide one of name, bio, avatar_url, language, theme')
  }

  const res = await api.patch('/users/me', body, {
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data as UserMe
}
