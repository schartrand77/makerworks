import type { UserProfile } from './UserProfile'

/**
 * User information returned from authentication endpoints.
 * Mirrors the backend `UserOut` model.
 */
export interface UserOut extends UserProfile {}
