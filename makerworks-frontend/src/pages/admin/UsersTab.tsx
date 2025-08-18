// src/pages/admin/UsersTab.tsx
import { useEffect, useMemo, useState } from 'react';
import axios from '@/api/client';

type AdminUser = {
  id: string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  role?: string | null;
  is_verified?: boolean | null;
  is_active?: boolean | null;
  created_at?: string | null;
  last_login?: string | null;
};

type UsersResponse = AdminUser[] | { items?: AdminUser[]; total?: number };

function normalizeItems(body: UsersResponse | any): AdminUser[] {
  if (Array.isArray(body)) return body as AdminUser[];
  if (body && Array.isArray(body.items)) return body.items as AdminUser[];
  return [];
}

function humanStatus(u: AdminUser) {
  const bits: string[] = [];
  if (u.is_verified != null) bits.push(u.is_verified ? 'Verified' : 'Unverified');
  if (u.is_active != null) bits.push(u.is_active ? 'Active' : 'Inactive');
  return bits.length ? bits.join(' · ') : '—';
}

export default function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async (): Promise<AdminUser[]> => {
      const tries: Array<() => Promise<UsersResponse>> = [
        // 1) trailing slash + offset/limit
        () => axios.get('/api/v1/admin/users/', { params: { offset: 0, limit: 1000 } }).then(r => r.data),
        // 2) no slash
        () => axios.get('/api/v1/admin/users', { params: { offset: 0, limit: 1000 } }).then(r => r.data),
        // 3) page/per_page
        () => axios.get('/api/v1/admin/users/', { params: { page: 1, per_page: 1000 } }).then(r => r.data),
        // 4) bare (some backends ignore pagination)
        () => axios.get('/api/v1/admin/users/').then(r => r.data),
      ];

      let lastErr: any = null;
      for (const attempt of tries) {
        try {
          const data = await attempt();
          const items = normalizeItems(data);
          // accept empty list too; if we got here without throwing, we’re good
          if (items.length >= 0) return items;
        } catch (e: any) {
          lastErr = e;
        }
      }
      throw lastErr ?? new Error('All user fetch attempts failed');
    };

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const items = await fetchUsers();
        if (!cancelled) setUsers(items ?? []);
      } catch (e: any) {
        console.error('[UsersTab] failed to load users', e);
        const st = e?.response?.status;
        const detail = e?.response?.data?.detail;
        const msg =
          st === 422 && detail
            ? `422: ${Array.isArray(detail) ? detail.map((d: any) => d?.msg || d?.type || 'required').join(', ') : JSON.stringify(detail)}`
            : st ? `${st}: Failed to load users` : 'Failed to load users';
        if (!cancelled) {
          setErr(msg);
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(() => {
    return users
      .slice()
      .sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        if (tb !== ta) return tb - ta; // newest first
        return (a.username || '').localeCompare(b.username || '');
      });
  }, [users]);

  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium">All Users</h2>
        <div className="text-sm text-zinc-500">{users.length} total</div>
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
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2 pr-4">Last login</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b last:border-0">
                  <td className="py-2 pr-4"><div className="h-3 w-28 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                  <td className="py-2 pr-4"><div className="h-3 w-56 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                  <td className="py-2 pr-4"><div className="h-3 w-16 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                  <td className="py-2 pr-4"><div className="h-3 w-24 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                  <td className="py-2 pr-4"><div className="h-3 w-36 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                  <td className="py-2 pr-4"><div className="h-3 w-40 bg-zinc-300/30 dark:bg-zinc-700/40 rounded animate-pulse" /></td>
                </tr>
              ))}

            {!loading && !err && sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 pr-4 text-zinc-500">No users found.</td>
              </tr>
            )}

            {!loading && !err && sorted.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{u.username ?? '—'}</td>
                <td className="py-2 pr-4">{u.email ?? '—'}</td>
                <td className="py-2 pr-4">{u.role ?? 'user'}</td>
                <td className="py-2 pr-4">{humanStatus(u)}</td>
                <td className="py-2 pr-4">{u.created_at ? new Date(u.created_at).toLocaleString() : '—'}</td>
                <td className="py-2 pr-4">{u.last_login ? new Date(u.last_login).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
