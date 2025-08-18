// src/pages/admin/FilamentsTab.tsx
import { useEffect, useMemo, useState } from 'react';
import axios from '@/api/client';

type Filament = {
  id: string;
  type?: string | null;
  color?: string | null;
  hex?: string | null;            // any CSS color string
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type FilamentsResponse = Filament[] | { items?: Filament[] } | Record<string, any>;

function normalizeItems(body: FilamentsResponse | any): Filament[] {
  if (!body) return [];
  if (Array.isArray(body)) return body as Filament[];
  if (Array.isArray((body as any).items)) return (body as any).items as Filament[];
  if (Array.isArray((body as any).filaments)) return (body as any).filaments as Filament[];
  if (Array.isArray((body as any).results)) return (body as any).results as Filament[];
  if (Array.isArray((body as any).rows)) return (body as any).rows as Filament[];
  if (Array.isArray((body as any).data)) return (body as any).data as Filament[];
  if ((body as any).data && Array.isArray((body as any).data.items)) return (body as any).data.items as Filament[];
  return [];
}

function formatApiError(data: any): string {
  if (!data) return '';
  // FastAPI “validation_error” envelope
  if (typeof data.detail === 'string' && data.detail === 'validation_error' && Array.isArray(data.errors)) {
    return data.errors
      .map((e: any) => {
        const loc = Array.isArray(e?.loc) ? e.loc.join('.') : e?.loc ?? '';
        const msg = e?.msg ?? e?.type ?? 'invalid';
        return loc ? `${loc}: ${msg}` : String(msg);
      })
      .join(' · ');
  }
  // FastAPI classic detail as array
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((d: any) => {
        const loc = Array.isArray(d?.loc) ? d.loc.join('.') : d?.loc ?? '';
        const msg = d?.msg ?? d?.type ?? 'unprocessable';
        return loc ? `${loc}: ${msg}` : String(msg);
      })
      .join(' · ');
  }
  // plain string
  if (typeof data.detail === 'string') return data.detail;
  // anything else
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export default function FilamentsTab() {
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tryGet = async (url: string, params?: Record<string, any>) => {
      const res = await axios.get(url, params ? { params } : undefined);
      return res.data;
    };

    const fetchFilaments = async (): Promise<Filament[]> => {
      // Only call the endpoints you actually have. Start with no params.
      const tries: Array<() => Promise<any>> = [
        () => tryGet('/api/v1/filaments'),                 // no trailing slash, no params
        () => tryGet('/api/v1/filaments/'),                // trailing slash, no params
        () => tryGet('/api/v1/filaments', { offset: 0, limit: 1000 }),
        () => tryGet('/api/v1/filaments/', { offset: 0, limit: 1000 }),
        // Optional: page/per_page if your backend tolerates them
        () => tryGet('/api/v1/filaments', { page: 1, per_page: 1000 }),
        () => tryGet('/api/v1/filaments/', { page: 1, per_page: 1000 }),
      ];

      let lastErr: any = null;
      for (const attempt of tries) {
        try {
          const data = await attempt();
          const items = normalizeItems(data);
          if (items) return items; // accept [] as success
        } catch (e: any) {
          lastErr = e;
        }
      }
      throw lastErr ?? new Error('All filament fetch attempts failed');
    };

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const items = await fetchFilaments();
        if (!cancelled) setFilaments(items ?? []);
      } catch (e: any) {
        console.error('[FilamentsTab] failed to load filaments', e);
        const st = e?.response?.status;
        const detailText = formatApiError(e?.response?.data);
        const msg = st
          ? `${st}: Failed to load filaments${detailText ? ` — ${detailText}` : ''}`
          : 'Failed to load filaments';
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

  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium">All Filaments</h2>
        <div className="text-sm text-zinc-500">{filaments.length} total</div>
      </div>

      {err && (
        <div className="mb-3 rounded-md px-3 py-2 text-sm border backdrop-blur-xl shadow-sm bg-red-50/80 dark:bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-200">
          {err}
        </div>
      )}

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
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b last:border-0">
                  <td className="py-2 pr-4"><div className="h-3 w-24 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                  <td className="py-2 pr-4"><div className="h-3 w-28 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                  <td className="py-2 pr-4"><div className="h-3 w-40 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                  <td className="py-2 pr-4"><div className="h-3 w-16 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                  <td className="py-2 pr-4"><div className="h-3 w-36 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                  <td className="py-2 pr-4"><div className="h-3 w-36 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                </tr>
              ))}

            {!loading && !err && sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 pr-4 text-zinc-500">No filaments found.</td>
              </tr>
            )}

            {!loading && !err && sorted.map((f) => (
              <tr key={f.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{f.type || '—'}</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 rounded-full border border-black/10 dark:border-white/15"
                      style={{ background: f.hex || 'transparent' }}
                      title={f.hex || ''}
                    />
                    <span>{f.color || '—'}</span>
                  </div>
                </td>
                <td className="py-2 pr-4">{f.hex || '—'}</td>
                <td className="py-2 pr-4">{f.is_active === false ? 'No' : 'Yes'}</td>
                <td className="py-2 pr-4">{f.created_at ? new Date(f.created_at).toLocaleString() : '—'}</td>
                <td className="py-2 pr-4">{f.updated_at ? new Date(f.updated_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
