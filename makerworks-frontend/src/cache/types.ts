export interface CachedUser {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;                  // optional, URL to avatar image
  roles: string[];                     // always present, can be empty []
  metadata?: Record<string, unknown>; // instead of unrestricted [key: string]: any
}
