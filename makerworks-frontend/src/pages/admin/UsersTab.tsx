import { useEffect, useState } from 'react';
import { fetchAllUsers, AdminUser } from '@/api/admin';

export default function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await fetchAllUsers();
        if (mounted) setUsers(list);
      } catch {
        if (mounted) setError('Failed to load users');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <p>Loading users…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="glass-card p-4">
      <div className="mb-3 text-sm text-zinc-400">
        {users.length} {users.length === 1 ? 'user' : 'users'}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-zinc-400 border-b">
            <tr>
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Last login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{u.username ?? '—'}</td>
                <td className="py-2 pr-4">{u.email ?? '—'}</td>
                <td className="py-2 pr-4">{u.role ?? 'user'}</td>
                <td className="py-2 pr-4">
                  {u.is_verified !== undefined ? (u.is_verified ? 'Verified' : 'Unverified') : '—'}
                  {u.is_active !== undefined ? ` · ${u.is_active ? 'Active' : 'Inactive'}` : ''}
                </td>
                <td className="py-2 pr-4">
                  {u.last_login ? new Date(u.last_login).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
