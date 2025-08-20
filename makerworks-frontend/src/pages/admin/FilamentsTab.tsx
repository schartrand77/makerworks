// src/pages/admin/FilamentsTab.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  getFilaments,
  createFilament,
  updateFilament,
  deleteFilament,
  type FilamentDTO,
} from '@/api/filaments';

type Filament = {
  id: string;
  type?: string | null;
  color?: string | null;
  hex?: string | null;            // any CSS color string
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
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
  // FastAPI "validation_error" envelope
  if (typeof data.detail === 'string' && data.detail === 'validation_error' && Array.isArray(data.errors)) {
    return data.errors.map((e: any) => {
      const loc = Array.isArray(e?.loc) ? e.loc.join('.') : e?.loc ?? '';
      const msg = e?.msg ?? e?.type ?? 'invalid';
      return loc ? `${loc}: ${msg}` : String(msg);
    }).join(' · ');
  }
  // FastAPI classic detail as array
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

type EditState = Partial<Filament> & { id?: string };

export default function FilamentsTab() {
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // row-level ui state
  const [creating, setCreating] = useState(false);
  const [createVal, setCreateVal] = useState<EditState>({ type: '', color: '', hex: '', is_active: true });
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
        // Active first
        const aa = a.is_active === false ? 1 : 0;
        const bb = b.is_active === false ? 1 : 0;
        if (aa !== bb) return aa - bb;
        // Then by type, then color
        const t = (a.type || '').localeCompare(b.type || '');
        if (t) return t;
        return (a.color || '').localeCompare(b.color || '');
      });
  }, [filaments]);

  const startEdit = (f: Filament) => {
    setEditingId(f.id);
    setEditVal({
      id: f.id,
      type: f.type ?? '',
      color: f.color ?? '',
      hex: f.hex ?? '',
      is_active: f.is_active !== false,
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditVal({});
  };

  const doCreate = async () => {
    if (creating) return;
    setCreating(true);
    setErr(null);
    try {
      const payload: FilamentDTO = {
        type: (createVal.type ?? '').trim(),
        color: (createVal.color ?? '').trim(),
        hex: (createVal.hex ?? '').trim(),
        is_active: !!createVal.is_active,
      };
      const created = await createFilament(payload);
      // optimistic: prepend
      setFilaments((prev) => [created, ...prev]);
      setCreateVal({ type: '', color: '', hex: '', is_active: true });
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
      const payload: FilamentDTO = {
        type: (editVal.type ?? '').toString(),
        color: (editVal.color ?? '').toString(),
        hex: (editVal.hex ?? '').toString(),
        is_active: !!editVal.is_active,
      };
      const updated = await updateFilament(id, payload);
      setFilaments((prev) => prev.map((f) => (f.id === id ? { ...f, ...updated } : f)));
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

      {/* Create row */}
      <div className="mb-4 rounded-md border p-3 backdrop-blur-xl shadow-sm">
        <div className="mb-2 text-sm font-medium">Add Filament</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
          <input
            className="col-span-1 sm:col-span-1 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
            placeholder="Type (PLA, PETG...)"
            value={createVal.type ?? ''}
            onChange={(e) => setCreateVal((v) => ({ ...v, type: e.target.value }))}
          />
          <input
            className="col-span-1 sm:col-span-1 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
            placeholder="Color name"
            value={createVal.color ?? ''}
            onChange={(e) => setCreateVal((v) => ({ ...v, color: e.target.value }))}
          />
          <input
            className="col-span-1 sm:col-span-2 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
            placeholder="Color value (hex or CSS color)"
            value={createVal.hex ?? ''}
            onChange={(e) => setCreateVal((v) => ({ ...v, hex: e.target.value }))}
          />
          <label className="col-span-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!createVal.is_active}
              onChange={(e) => setCreateVal((v) => ({ ...v, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div className="col-span-1 flex items-center justify-end">
            <button
              className="rounded px-3 py-1 text-sm border shadow-sm disabled:opacity-50"
              disabled={creating || !(createVal.type ?? '').trim()}
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
                  {[24, 28, 40, 16, 36, 36, 24].map((w, j) => (
                    <td key={j} className="py-2 pr-4">
                      <div className="h-3" style={{ width: w }} />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && !err && sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 pr-4 text-zinc-500">No filaments found.</td>
              </tr>
            )}

            {!loading && !err && sorted.map((f) => {
              const isEditing = editingId === f.id;
              return (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <input
                        className="w-40 rounded border px-2 py-1 bg-white/70 dark:bg-zinc-900/60"
                        value={editVal.type ?? ''}
                        onChange={(e) => setEditVal((v) => ({ ...v, type: e.target.value }))}
                      />
                    ) : (f.type || '—')}
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
                          className="inline-block h-4 w-4 rounded-full border border-black/10 dark:border-white/15"
                          style={{ background: f.hex || 'transparent' }}
                          title={f.hex || ''}
                        />
                        <span>{f.color || '—'}</span>
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
                    ) : (f.hex || '—')}
                  </td>
                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!editVal.is_active}
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
                          <button
                            className="rounded px-2 py-1 border shadow-sm"
                            onClick={() => startEdit(f)}
                          >
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
                            disabled={savingId === f.id || !(editVal.type ?? '').toString().trim()}
                            onClick={() => doSave(f.id)}
                          >
                            {savingId === f.id ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            className="rounded px-2 py-1 border shadow-sm"
                            onClick={cancelEdit}
                          >
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
