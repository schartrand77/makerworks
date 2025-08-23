// src/api/filaments.ts
import client from '@/lib/client';

const raw = import.meta.env.VITE_API_PREFIX || '/api/v1';
// In dev (vite on :5173), guess the backend origin if only a path was given
const guessed =
  raw.startsWith('/') && typeof window !== 'undefined' && window.location.port === '5173'
    ? 'http://localhost:8000/api/v1'
    : raw;
// Strip any trailing slashes once, and never append another
export const API_PREFIX = guessed.replace(/\/+$/, '');
const BASE = `${API_PREFIX}/filaments`; // <- no trailing slash

function clean<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

function logAxios(err: any, label: string) {
  const allow = err?.response?.headers?.['allow'];
  // eslint-disable-next-line no-console
  console.warn('[filaments]', err?.response?.status, 'on', label, 'Allow:', allow ?? '(no Allow header)');
}

/** List filaments (optionally with simple search/paging) */
export async function listFilaments(params?: {
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const res = await client.get(BASE, { params });
  return res.data;
}

/** Create a filament; include `barcode` to attach one at create-time */
export async function createFilament(input: {
  material?: string;
  category?: string; // e.g. "Matte" / "Silk" / "CF"
  type?: string;     // alias for category
  color_name?: string;
  color_hex?: string;
  price_per_kg?: number; // numeric
  is_active?: boolean;
  barcode?: string; // optional single barcode to add
}) {
  const payload = clean({
    material: input.material,
    category: input.category ?? input.type,
    type: input.type ?? input.category,
    color_name: input.color_name,
    color_hex: input.color_hex,
    price_per_kg: input.price_per_kg,
    is_active: input.is_active ?? true,
    barcode: input.barcode?.trim(),
  });

  // eslint-disable-next-line no-console
  console.info('[filaments] POST', BASE, 'payload →', payload);

  try {
    const res = await client.post(BASE, payload);
    return res.data;
  } catch (err) {
    logAxios(err, BASE);
    throw err;
  }
}

/** Update a filament by id */
export async function updateFilament(
  id: string,
  changes: Partial<{
    material: string;
    category: string;
    type: string;
    color_name: string;
    color_hex: string;
    price_per_kg: number;
    is_active: boolean;
  }>
) {
  const url = `${BASE}/${id}`;
  const payload = clean(changes);
  try {
    const res = await client.patch(url, payload);
    return res.data;
  } catch (err) {
    logAxios(err, url);
    throw err;
  }
}

/** Delete a filament by id */
export async function deleteFilament(id: string) {
  const url = `${BASE}/${id}`;
  try {
    await client.delete(url);
    return { ok: true };
  } catch (err) {
    logAxios(err, url);
    throw err;
  }
}

/** Attach a barcode to a filament */
export async function addBarcode(id: string, code: string) {
  const url = `${BASE}/${id}/barcodes`;
  try {
    const res = await client.post(url, { code: code.trim() });
    return res.data;
  } catch (err) {
    logAxios(err, url);
    throw err;
  }
}

/** Remove a barcode from a filament */
export async function removeBarcode(id: string, code: string) {
  const url = `${BASE}/${id}/barcodes/${encodeURIComponent(code)}`;
  try {
    await client.delete(url);
    return { ok: true };
  } catch (err) {
    logAxios(err, url);
    throw err;
  }
}

/** Simple helper used by EstimateCard etc. */
export async function fetchAvailableFilaments() {
  // server returns active filaments; filter client-side if needed
  const res = await client.get(BASE);
  return res.data;
}
