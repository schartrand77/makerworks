// src/pages/admin/BackupsTab.tsx
import { useEffect, useMemo, useRef, useState } from 'react';

type BackupJob = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'ok' | 'error' | string;
  kind: 'manual' | 'scheduled' | string;
  created_by?: string | null;
  location?: string | null;
  db_bytes?: number | null;
  media_bytes?: number | null;
  total_bytes?: number | null;
  manifest_sha256?: string | null;
  error?: string | null;
};

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:8000';
const API = `${API_BASE}/api/v1`;

function fmtBytes(n?: number | null) {
  const x = typeof n === 'number' ? n : 0;
  if (x < 1024) return `${x} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let u = -1;
  let v = x;
  do {
    v /= 1024;
    u++;
  } while (v >= 1024 && u < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[u]}`;
}

function age(ts?: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function BackupsTab() {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/backup`, { credentials: 'include' });
      if (!res.ok) throw new Error(`List failed: ${res.status}`);
      const data = await res.json();
      setJobs(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  const runNow = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/backup/run`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`Start failed: ${res.status}`);
      // kick a short poll for a minute
      let count = 0;
      pollRef.current && window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        count++;
        await refresh();
        const running = (jobs[0]?.status ?? '') === 'running';
        if (!running || count > 12) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 5000);
    } catch (e: any) {
      setError(e?.message || 'Failed to start backup');
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    refresh();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latest = jobs[0];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-2 justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Backups</h2>
          <p className="opacity-80 text-sm">
            Snapshot of database + uploads. Storage: <code>{API_BASE}</code>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="mw-btn" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="mw-btn mw-btn--amber" onClick={runNow} disabled={starting}>
            {starting ? 'Starting…' : 'Run Backup Now'}
          </button>
        </div>
      </header>

      {error && (
        <div className="mw-card p-3 text-red-600">
          <strong>Oops:</strong> {error}
        </div>
      )}

      {latest && (
        <div className="mw-card p-3">
          <div className="flex flex-wrap justify-between items-center">
            <div>
              <div className="text-sm opacity-70">Latest</div>
              <div className="font-medium">
                {latest.status.toUpperCase()} · {age(latest.started_at)}
                {latest.finished_at ? ` → ${age(latest.finished_at)}` : ''}
              </div>
              <div className="text-sm break-all opacity-80">
                {latest.location ? latest.location : '—'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm opacity-70">Size</div>
              <div className="font-medium">{fmtBytes(latest.total_bytes)}</div>
              <div className="text-xs opacity-70">
                DB {fmtBytes(latest.db_bytes)} · Media {fmtBytes(latest.media_bytes)}
              </div>
            </div>
          </div>
          {latest.error && (
            <div className="mt-2 text-sm text-red-600">
              <strong>Error:</strong> {latest.error}
            </div>
          )}
        </div>
      )}

      <div className="mw-card p-0 overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left bg-black/10">
              <th className="p-2">Started</th>
              <th className="p-2">Finished</th>
              <th className="p-2">Status</th>
              <th className="p-2">Size</th>
              <th className="p-2">Location</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t border-white/10 align-top">
                <td className="p-2 whitespace-nowrap">{age(j.started_at)}</td>
                <td className="p-2 whitespace-nowrap">{age(j.finished_at)}</td>
                <td className="p-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded ${
                      j.status === 'ok'
                        ? 'bg-emerald-600/30'
                        : j.status === 'running'
                        ? 'bg-amber-600/30'
                        : 'bg-red-700/30'
                    }`}
                  >
                    {j.status}
                  </span>
                </td>
                <td className="p-2 whitespace-nowrap">{fmtBytes(j.total_bytes)}</td>
                <td className="p-2 break-all">{j.location || '—'}</td>
              </tr>
            ))}
            {jobs.length === 0 && !loading && (
              <tr>
                <td className="p-3 opacity-70" colSpan={5}>
                  No backups yet. Click “Run Backup Now” and boom—instant peace of mind.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
