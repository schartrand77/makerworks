// src/api/filaments.ts
import axios from "./client";

export interface Filament {
  id: string;
  type: string;
  color: string;
  hex: string;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface NewFilament {
  type: string;
  color?: string;
  hex?: string;
  is_active?: boolean;
}

export interface UpdateFilament {
  type?: string;
  color?: string;
  hex?: string;
  is_active?: boolean;
}

function clean<T extends Record<string, unknown>>(obj: T | undefined | null): Partial<T> {
  if (!obj) return {};
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== "" && v !== null && v !== undefined)
  ) as Partial<T>;
}

export async function fetchAvailableFilaments(params?: {
  include_inactive?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<Filament[]> {
  const res = await axios.get<Filament[]>("/filaments", { params: clean(params) });
  return res.data;
}

export async function addFilament(data: NewFilament): Promise<Filament> {
  const body = clean<NewFilament>({
    type: data.type?.trim(),
    color: data.color?.trim(),
    hex: data.hex?.trim(),
    is_active: data.is_active,
  });
  const res = await axios.post<Filament>("/filaments", body);
  return res.data;
}

export async function updateFilament(id: string, data: UpdateFilament): Promise<Filament> {
  const body = clean<UpdateFilament>({
    type: data.type?.toString().trim(),
    color: data.color?.toString().trim(),
    hex: data.hex?.toString().trim(),
    is_active: data.is_active,
  });
  const res = await axios.patch<Filament>(`/filaments/${id}`, body);
  return res.data;
}

export async function deleteFilament(id: string): Promise<void> {
  await axios.delete(`/filaments/${id}`);
}

/* ── Legacy aliases (so old imports keep working) ─────────────────────────── */
export const createFilament = addFilament;
export const getFilaments   = fetchAvailableFilaments;
export const listFilaments  = fetchAvailableFilaments;
export const removeFilament = deleteFilament;
export const patchFilament  = updateFilament;

/* Optional default for convenience */
export default {
  fetchAvailableFilaments,
  addFilament,
  updateFilament,
  deleteFilament,
  createFilament,
  getFilaments,
  listFilaments,
  removeFilament,
  patchFilament,
};
