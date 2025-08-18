import type { UserProfile } from './UserProfile'

/**
 * User information returned from authentication endpoints.
 * Mirrors the backend `UserOut` model.
 */
export interface UserOut extends UserProfile {
  /** Optional collection of additional roles */
  roles?: Array<string | { name?: string }>
  /** Optional permission strings */
  permissions?: string[]
  /** Various admin flags from backend */
  is_admin?: boolean
  isAdmin?: boolean
  role_id?: number
  scope?: string
}
