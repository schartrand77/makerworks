/**
 * Represents an authenticated user.
 */
export interface AuthUser {
  groups?: string[];
}

/**
 * Checks if the user has a specific role/group.
 * @param user The user object
 * @param role The group/role name to check
 */
export function hasRole(user: AuthUser | undefined, role: string): boolean {
  return user?.groups?.includes(role) ?? false;
}

/**
 * Checks if the user is an admin.
 */
export function isAdmin(user?: AuthUser): boolean {
  return hasRole(user, 'MakerWorks-Admin');
}

/**
 * Checks if the user is a regular user.
 */
export function isUser(user?: AuthUser): boolean {
  return hasRole(user, 'MakerWorks-User');
}
