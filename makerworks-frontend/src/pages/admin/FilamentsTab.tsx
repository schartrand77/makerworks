// src/pages/admin/FilamentsTab.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  getFilaments,
  createFilament,
  updateFilament,
  deleteFilament,
  type FilamentDTO,
} from '@/api/filaments';
import { bgClassFromHex } from '@/lib/colorMap';

type BarcodeLite = {
  code?: string | null;
  symbology?: string | null;
  is_primary?: boolean | null;
  isPrimary?: boolean | null;
  is_primary_barcode?: boolean | null;
};

type Filament = {
  id: string;
  // legacy fields
  type?: string | null;
  color?: string | null;
  hex?: string | null;            // any CSS color string
  is_active?: boolean | null;
  // new backend fields (optional)
  name?: string | null;
  category?: string | null;
  colorHex?: string | null;
  pricePerKg?: number | null;
  created_at?: string | null;
  updated_at?: string | null;

  // barcode-ish fields (backend may return none, one, or a list)
  barcode?: string | null;
  code?: string | null;
  symbology?: string | null;
  is_primary_barcode?: boolean | null;
  barcodes?: BarcodeLite[] | null;
};

function normalizeItems(body: any): Filament[] {
  if (!body) return [];
  if (Array.isArray(body)) return body as Filament[];
  if (Array.isArray(body?.items)) return body.items as Filament[];
  if (Array.isArray(body?.filaments)) return body.filaments as Filament[];
  if (Array.isArray(body?.results)) return body.results as Filament[];
  if (Array.isArray(body?.rows)) return body.rows as Filament[];
  if (Array.isArray(body?.data)) return body.data as Filament[];
  if (body?.data && Array.isArray(body.data.items)) return body.data.items as Filament[];
  return [];
}

function formatApiError(data: any): string {
  if (!data) return '';
  if (typeof data.detail === 'string' && data.detail === 'validation_error' && Array.isArray(data.errors)) {
    return data.errors.map((e: any) => {
      const loc = Array.isArray(e?.loc) ? e.loc.join('.') : e?.loc ?? '';
      const msg = e?.msg ?? e?.type ?? 'invalid';
      return loc ? `${loc}: ${msg}` : String(msg);
    }).join(' · ');
  }
  if (Array.isArray(data.detail)) {
    return data.detail.map((d: any) => {
      const loc = Array.isArray(d?.loc) ? d.loc.join('.') : d?.loc ?? '';
      const msg = d?.msg ?? d?.type ?? 'unprocessable';
      return loc ? `${loc}: ${msg}` : String(msg);
    }).join(' · ');
  }
  if (typeof data.detail === 'string') return data.detail;
  try { return JSON.stringify(data); } catch { return String(data); }
}

function stripEmpty<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

function toNumberOr<T extends number | undefined>(v: any, fallback: T): number | T {
  const n = typeof v === 'string' ? v.trim() : v;
  if (n === '' || n === null || n === undefined) return fallback;
  const num = Number(n);
  return Number.isFinite(num) ? num : fallback;
}

function ensureHashHex(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.startsWith('#') ? s : `#${s}`;
}

function primaryBarcodeOf(f: Filament | undefined | null): string | undefined {
  if (!f) return undefined;
  const direct = f.barcode || f.code;
  if (direct) return direct || undefined;
  const list = f.barcodes;
  if (Array.isArray(list) && list.length > 0) {
    const prim = list.find(b => b.is_primary === true || b.isPrimary === true || b.is_primary_barcode === true) ?? list[0];
    return prim?.code || undefined;
  }
  return undefined;
}

type EditState = Partial<Filament> & { id?: string };

export default function FilamentsTab() {
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // row-level ui state
  const [creating, setCreating] = useState(false);
  const [createVal, setCreateVal] = useState<EditState>({
    type: '',
    color: '',
    hex: '',
    pricePerKg: 0,
    is_active: true,
    barcode: '',
    symbology: '',
    is_primary_barcode: true,
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<EditState>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await getFilaments();
        const items = normalizeItems(res);
        if (!cancelled) setFilaments(items ?? []);
      } catch (e: any) {
        console.error('[FilamentsTab] failed to load filaments', e);
        const st = e?.response?.status;
        const detailText = formatApiError(e?.response?.data);
        const msg = st ? `${st}: Failed to load filaments${detailText ? ` — ${detailText}` : ''}` : 'Failed to load filaments';
        if (!cancelled) {
          setErr(msg);
          setFilaments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(() => {
    return filaments
      .slice()
      .sort((a, b) => {
        const aa = a.is_active === false ? 1 : 0;
        const bb = b.is_active === false ? 1 : 0;
        if (aa !== bb) return aa - bb;
        const at = (a.category || a.type || '').toString();
        const bt = (b.category || b.type || '').toString();
        const t = at.localeCompare(bt);
        if (t) return t;
        const ac = (a.name || a.color || '').toString();
        const bc = (b.name || b.color || '').toString();
        return ac.localeCompare(bc);
      });
  }, [filaments]);

  const startEdit = (f: Filament) => {
    setEditingId(f.id);
    setEditVal({
      id: f.id,
      type: f.type ?? f.category ?? '',
      color: f.color ?? f.name ?? '',
      hex: f.hex ?? f.colorHex ?? '',
      pricePerKg: typeof f.pricePerKg === 'number' ? f.pricePerKg : 0,
      is_active: f.is_active !== false,
      barcode: primaryBarcodeOf(f) ?? '',
      symbology: f.symbology ?? '',
      is_primary_barcode: true,
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditVal({});
  };

  /** Build a superset payload compatible with old and new backends. */
  const compatPayloadFrom = (src: EditState) => {
    const type = (src.type ?? '').toString().trim();
    const color = (src.color ?? '').toString().trim();
    const hex = ensureHashHex(src.hex ?? '') ?? '';
    const pricePerKg = toNumberOr(src.pricePerKg, 0);
    const is_active = !!src.is_active;

    // barcode fields (optional)
    const barcode = (src.barcode ?? src.code ?? '').toString().trim();
    const symbology = (src.symbology ?? '').toString().trim();
    const is_primary_barcode = src.is_primary_barcode != null ? !!src.is_primary_barcode : true;

    // derive new schema fields
    const category = type;
    const name = `${type} ${color}`.trim();
    const colorHex = hex;

    const superset = stripEmpty({
      // legacy keys
      type, color, hex, is_active,
      // new keys
      name, category, colorHex, pricePerKg,
      // barcode keys (backend accepts 'barcode' and optional 'symbology'/'is_primary_barcode')
      barcode,
      symbology,
      is_primary_barcode,
    });

    return superset as unknown as FilamentDTO;
  };

  const doCreate = async () => {
    if (creating) return;
    setCreating(true);
    setErr(null);
    try {
      const payload = compatPayloadFrom(createVal);
      const created = await createFilament(payload);
      setFilaments((prev) => [{ ...(payload as any), ...(created as any) } as Filament, ...prev]);
      setCreateVal({
        type: '',
        color: '',
        hex: '',
        pricePerKg: 0,
        is_active: true,
        barcode: '',
        symbology: '',
        is_primary_barcode: true,
      });
    } catch (e: any) {
      console.error('[FilamentsTab] create failed', e);
      const st = e?.response?.status;
      const detailText = formatApiError(e?.response?.data);
      setErr(st ? `${st}: Create failed${detailText ? ` — ${detailText}` : ''}` : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const doSave = async (id: string) => {
    if (savingId) return;
    setSavingId(id);
    setErr(null);
    try {
      const payload = compatPayloadFrom(editVal);
      const updated = await updateFilament(id, payload);
      setFilaments((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...(payload as any), ...(updated as any) } : f))
      );
      cancelEdit();
    } catch (e: any) {
      console.error('[FilamentsTab] save failed', e);
      const st = e?.response?.status;
      const detailText = formatApiError(e?.response?.data);
      setErr(st ? `${st}: Save failed${detailText ? ` — ${detailText}` : ''}` : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const doDelete = async (id: string) => {
    if (savingId) return;
    setSavingId(id);
    setErr(null);
    try {
      await deleteFilament(id);
      setFilaments((prev) => prev.filter((f) => f.id !== id));
      if (editingId === id) cancelEdit();
    } catch (e: any) {
      console.error('[FilamentsTab] delete failed', e);
      const st = e?.response?.status;
      const detailText = formatApiError(e?.response?.data);
      setErr(st ? `${st}: Delete failed${detailText ? ` — ${detailText}` : ''}` : 'Delete failed');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium">Filaments</h2>
        <div className="text-sm text-zinc-500">{filaments.length} total</div>
      </div>

      {err && (
        <div className="mb-3 rounded-md px-3 py-2 text-sm border backdrop-blur-xl shadow-sm bg-red-50/80 dark:bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-200">
          {err}
        </div>
      )}

      {/* Create row — now supports barcode (optional). Default "Active" true. */}
      <div className="mb-4 rounded-md border p-3 backdrop-blur-xl shadow-sm">
        <div className="mb-2 text-sm font-medium">Add Filament</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
          <input
            className="col-span-12 sm:col-span-2 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
            placeholder="Type (PLA, PETG...)"
            value={createVal.type ?? ''}
            onChange={(e) => setCreateVal((v) => ({ ...v, type: e.target.value }))}
          />
          <input
            className="col-span-12 sm:col-span-2 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
            placeholder="Color name"
            value={createVal.color ?? ''}
            onChange={(e) => setCreateVal((v) => ({ ...v, color: e.target.value }))}
          />
          <input
            className="col-span-12 sm:col-span-2 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
            placeholder="Color hex (#000000)"
            value={createVal.hex ?? ''}
            onChange={(e) => setCreateVal((v) => ({ ...v, hex: e.target.value }))}
          />
          <input
            className="col-span-12 sm:col-span-3 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
            placeholder="Barcode (optional)"
            value={createVal.barcode ?? ''}
            onChange={(e) => setCreateVal((v) => ({ ...v, barcode: e.target.value }))}
          />
          <input
            className="col-span-12 sm:col-span-2 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
            placeholder="Price/kg (e.g., 24.99)"
            type="number"
            step="0.01"
            value={createVal.pricePerKg ?? 0}
            onChange={(e) => setCreateVal((v) => ({ ...v, pricePerKg: Number(e.target.value) }))}
          />

          <div className="col-span-12 sm:col-span-1 flex items-center justify-end">
            <button
              className="rounded px-3 py-1 text-sm border shadow-sm disabled:opacity-50"
              disabled={
                creating ||
                !(createVal.type && createVal.color && createVal.hex) ||
                createVal.pricePerKg == null
              }
              onClick={doCreate}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-zinc-400 border-b">
            <tr>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Color</th>
              <th className="py-2 pr-4">Value</th>
              <th className="py-2 pr-4">Barcode</th>
              <th className="py-2 pr-4">Price/kg</th>
              <th className="py-2 pr-4">Active</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2 pr-4">Updated</th>
              <th className="py-2 pr-0 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b last:border-0">
                  {[24, 28, 40, 40, 24, 16, 36, 36, 24].map((w, j) => (
                    <td key={j} className="py-2 pr-4">
                      <div className="h-3" style={{ width: w }} />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && !err && sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="py-3 pr-4 text-zinc-500">No filaments found.</td>
              </tr>
            )}

            {!loading && !err && sorted.map((f) => {
              const isEditing = editingId === f.id;
              const displayHex = f.colorHex ?? f.hex ?? '';
              const displayPrice = typeof f.pricePerKg === 'number' ? f.pricePerKg : undefined;
              const displayBarcode = primaryBarcodeOf(f) ?? '—';

              return (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <input
                        className="w-40 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
                        value={editVal.type ?? ''}
                        onChange={(e) => setEditVal((v) => ({ ...v, type: e.target.value }))}
                      />
                    ) : (f.type || f.category || '—')}
                  </td>

                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <input
                        className="w-40 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
                        value={editVal.color ?? ''}
                        onChange={(e) => setEditVal((v) => ({ ...v, color: e.target.value }))}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block h-4 w-4 rounded-full border border-black/10 dark:border-white/15 ${bgClassFromHex(displayHex)}`}
                          title={displayHex || ''}
                        />
                        <span>{f.color || f.name || '—'}</span>
                      </div>
                    )}
                  </td>

                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <input
                        className="w-48 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
                        value={editVal.hex ?? ''}
                        onChange={(e) => setEditVal((v) => ({ ...v, hex: e.target.value }))}
                      />
                    ) : (displayHex || '—')}
                  </td>

                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <input
                        className="w-48 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
                        placeholder="Barcode"
                        value={editVal.barcode ?? ''}
                        onChange={(e) => setEditVal((v) => ({ ...v, barcode: e.target.value }))}
                      />
                    ) : displayBarcode}
                  </td>

                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <input
                        className="w-28 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
                        type="number"
                        step="0.01"
                        value={editVal.pricePerKg ?? 0}
                        onChange={(e) => setEditVal((v) => ({ ...v, pricePerKg: Number(e.target.value) }))}
                      />
                    ) : (displayPrice != null ? `$${displayPrice.toFixed(2)}` : '—')}
                  </td>

                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!(editVal.is_active ?? true)}
                          onChange={(e) => setEditVal((v) => ({ ...v, is_active: e.target.checked }))}
                        />
                        Active
                      </label>
                    ) : (f.is_active === false ? 'No' : 'Yes')}
                  </td>

                  <td className="py-2 pr-4">{f.created_at ? new Date(f.created_at).toLocaleString() : '—'}</td>
                  <td className="py-2 pr-4">{f.updated_at ? new Date(f.updated_at).toLocaleString() : '—'}</td>

                  <td className="py-2 pr-0">
                    <div className="flex justify-end gap-2">
                      {!isEditing ? (
                        <>
                          <button className="rounded px-2 py-1 border shadow-sm" onClick={() => startEdit(f)}>
                            Edit
                          </button>
                          <button
                            className="rounded px-2 py-1 border shadow-sm text-red-600"
                            disabled={savingId === f.id}
                            onClick={() => doDelete(f.id)}
                          >
                            {savingId === f.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="rounded px-2 py-1 border shadow-sm"
                            disabled={
                              savingId === f.id ||
                              !( (editVal.type ?? '').trim() && (editVal.color ?? '').trim() && (editVal.hex ?? '').trim() )
                            }
                            onClick={() => doSave(f.id!)}
                          >
                            {savingId === f.id ? 'Saving…' : 'Save'}
                          </button>
                          <button className="rounded px-2 py-1 border shadow-sm" onClick={cancelEdit}>
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
