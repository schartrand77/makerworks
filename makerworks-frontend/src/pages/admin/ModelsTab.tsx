// src/pages/admin/ModelsTab.tsx
import { useEffect, useMemo, useState } from 'react';
import axios from '@/api/client';

type AnyUser = {
  id?: string;
  username?: string | null;
  email?: string | null;
  name?: string | null;
};

type AnyModel = {
  id: string;
  name?: string | null;
  description?: string | null;
  filename?: string | null;        // e.g. uploaded file name
  filepath?: string | null;        // server path (we won't render as image)
  size?: number | null;            // bytes
  uploaded_at?: string | null;     // ISO timestamp
  created_at?: string | null;      // fallback timestamp
  user_id?: string | null;
  user?: AnyUser | null;           // if backend expands user
};

type ModelsResponse = AnyModel[] | { items?: AnyModel[] };

function formatBytes(n?: number | null) {
  if (n == null || Number.isNaN(n)) return '—';
  const bytes = Number(n);
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  let val = bytes;
  do {
    val /= 1024;
    i++;
  } while (val >= 1024 && i < units.length - 1);
  return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${units[i]}`;
}

export default function ModelsTab() {
  const [models, setModels] = useState<AnyModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // Pull a flat list of ALL uploaded models (no images).
        // Endpoint mirrors your browse page logs: GET /api/v1/models
        const res = await axios.get<ModelsResponse>('/api/v1/models');
        if (cancelled) return;
        const body = res.data;
        const items = Array.isArray(body) ? body : (body.items ?? []);
        setModels(items ?? []);
      } catch (e: any) {
        console.error('[ModelsTab] failed to load models', e);
        const st = e?.response?.status;
        const detail = e?.response?.data?.detail;
        const msg =
          st === 422 && detail
            ? `422: ${Array.isArray(detail) ? detail.map((d: any) => d?.msg || d?.type || 'unprocessable').join(', ') : JSON.stringify(detail)}`
            : 'Failed to load models';
        setErr(msg);
        setModels([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = models.length;

  const sorted = useMemo(() => {
    // newest first by uploaded_at / created_at, then name
    return models
      .slice()
      .sort((a, b) => {
        const ta =
          (a.uploaded_at ? Date.parse(a.uploaded_at) : NaN) ||
          (a.created_at ? Date.parse(a.created_at) : NaN) ||
          0;
        const tb =
          (b.uploaded_at ? Date.parse(b.uploaded_at) : NaN) ||
          (b.created_at ? Date.parse(b.created_at) : NaN) ||
          0;
        if (tb !== ta) return tb - ta;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [models]);

  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium">All Uploaded Models</h2>
        <div className="text-sm text-zinc-500">{total} total</div>
      </div>

      {/* error banner */}
      {err && (
        <div className="mb-3 rounded-md px-3 py-2 text-sm border backdrop-blur-xl shadow-sm bg-red-50/80 dark:bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-200">
          {err}
        </div>
      )}

      {/* list (no images) */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-zinc-400 border-b">
            <tr>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">File</th>
              <th className="py-2 pr-4">Size</th>
              <th className="py-2 pr-4">Uploaded</th>
              <th className="py-2 pr-4">User</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <div className="h-3 w-40 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" />
                  </td>
                  <td className="py-2 pr-4">
                    <div className="h-3 w-80 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" />
                  </td>
                  <td className="py-2 pr-4">
                    <div className="h-3 w-52 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" />
                  </td>
                  <td className="py-2 pr-4">
                    <div className="h-3 w-16 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" />
                  </td>
                  <td className="py-2 pr-4">
                    <div className="h-3 w-40 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" />
                  </td>
                  <td className="py-2 pr-4">
                    <div className="h-3 w-48 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" />
                  </td>
                </tr>
              ))}

            {!loading && !err && sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 pr-4 text-zinc-500">
                  No models found.
                </td>
              </tr>
            )}

            {!loading &&
              !err &&
              sorted.map((m) => {
                const when = m.uploaded_at || m.created_at;
                const whenStr = when ? new Date(when).toLocaleString() : '—';
                const userStr =
                  m.user?.username ||
                  m.user?.email ||
                  m.user_id ||
                  '—';
                return (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 align-top whitespace-pre-wrap break-words">
                      {m.name || '—'}
                    </td>
                    <td className="py-2 pr-4 align-top whitespace-pre-wrap break-words max-w-[60ch]">
                      {m.description || '—'}
                    </td>
                    <td className="py-2 pr-4 align-top whitespace-pre-wrap break-words">
                      {m.filename || m.filepath || '—'}
                    </td>
                    <td className="py-2 pr-4 align-top">{formatBytes(m.size as number | undefined)}</td>
                    <td className="py-2 pr-4 align-top">{whenStr}</td>
                    <td className="py-2 pr-4 align-top">{userStr}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
