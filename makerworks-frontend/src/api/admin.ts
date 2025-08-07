import axios from "./axios";

export {
  fetchAvailableFilaments,
  addFilament,
  updateFilament,
  deleteFilament,
  type Filament,
  type NewFilament,
  type UpdateFilament,
} from "./filaments";

/**
 * TYPES
 */

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  banned?: boolean;
  role?: string;
  groups?: string[];
}

export interface Model {
  id: string;
  name: string;
  description?: string;
}


/**
 * USERS
 */

/**
 * Fetch all users with optional query params (e.g., pagination, search)
 */
export async function fetchAllUsers(
  params?: Record<string, any>
): Promise<AdminUser[]> {
  try {
    const res = await axios.get<AdminUser[]>("/admin/users", { params });
    return res.data;
  } catch (err) {
    console.error("[Admin] Failed to fetch users:", err);
    throw err;
  }
}

export async function banUser(userId: string): Promise<void> {
  try {
    await axios.post(`/admin/users/${userId}/demote`);
  } catch (err) {
    console.error(`[Admin] Failed to ban user ${userId}:`, err);
    throw err;
  }
}

export async function promoteUser(userId: string): Promise<void> {
  try {
    await axios.post(`/admin/users/${userId}/promote`);
  } catch (err) {
    console.error(`[Admin] Failed to promote user ${userId}:`, err);
    throw err;
  }
}

export async function deleteUser(userId: string): Promise<void> {
  try {
    await axios.delete(`/admin/users/${userId}`);
  } catch (err) {
    console.error(`[Admin] Failed to delete user ${userId}:`, err);
    throw err;
  }
}

export async function resetPassword(userId: string): Promise<void> {
  try {
    await axios.post(`/admin/users/${userId}/reset-password`);
  } catch (err) {
    console.error(`[Admin] Failed to reset password for user ${userId}:`, err);
    throw err;
  }
}

/**
 * MODELS
 */

/**
 * Fetch all models with optional query params (e.g., pagination, filters)
 */
export async function fetchAllModels(
  params?: Record<string, any>
): Promise<Model[]> {
  try {
    const res = await axios.get<Model[]>("/models", { params });
    return res.data;
  } catch (err) {
    console.error("[Admin] Failed to fetch models:", err);
    throw err;
  }
}

export async function updateModel(
  id: string,
  data: Partial<Model>
): Promise<Model> {
  try {
    const res = await axios.patch<Model>(`/models/${id}`, data);
    return res.data;
  } catch (err) {
    console.error(`[Admin] Failed to update model ${id}:`, err);
    throw err;
  }
}

