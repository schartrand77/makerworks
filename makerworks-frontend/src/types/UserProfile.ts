// src/types/UserProfile.ts

/**
 * Represents a user profile as returned by the backend.
 * Matches backend `UserOut` Pydantic model.
 */
export interface UserProfile {
  /** UUID of the user */
  id: string

  /** User's unique username */
  username: string

  /** User's email address */
  email: string

  /** Optional display name (e.g. full name) */
  name?: string

  /** Role of the user. May be a string, object, or array depending on backend shape */
  role?: string | { name?: string } | Array<string | { name?: string }>

  /** Optional groups or roles the user belongs to */
  groups?: string[]

  /** URL to the avatar image */
  avatar_url?: string

  /** URL to the avatar thumbnail image */
  thumbnail_url?: string

  /** ISO timestamp when avatar was last updated */
  avatar_updated_at?: string

  /** Optional biography */
  bio?: string

  /** Optional preferred language */
  language?: string

  /** ISO timestamp of account creation */
  created_at?: string

  /** ISO timestamp of last login */
  last_login?: string
}
