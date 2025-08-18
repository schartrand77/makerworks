import axios from './client'

export interface Filament {
  id: string
  type: string
  color: string
  hex: string
}

export interface NewFilament {
  type: string
  color: string
  hex: string
}

export interface UpdateFilament {
  type?: string
  color?: string
  hex?: string
}

/**
 * Fetch all available filaments.
 */
export async function fetchAvailableFilaments(): Promise<Filament[]> {
  const res = await axios.get<Filament[]>('/filaments/')
  return res.data
}

/**
 * Add a new filament (admin only).
 */
export async function addFilament(data: NewFilament): Promise<Filament> {
  const res = await axios.post<Filament>('/filaments/', data)
  return res.data
}

/**
 * Update a filament by ID (admin only).
 */
export async function updateFilament(id: string, data: UpdateFilament): Promise<Filament> {
  const res = await axios.put<Filament>(`/filaments/${id}`, data)
  return res.data
}

/**
 * Delete a filament by ID (admin only).
 */
export async function deleteFilament(id: string): Promise<void> {
  await axios.delete(`/filaments/${id}`)
}
