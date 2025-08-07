import { useEffect, useState } from 'react';
import GlassButton from '@/components/ui/GlassButton';
import { useToast } from '@/hooks/useToast';
import { fetchAllUsers, promoteUser, resetPassword, banUser, AdminUser } from '@/api/admin';
import { confirmAlert } from 'react-confirm-alert';

export default function UsersTab() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAllUsers()
      .then(setUsers)
      .catch(() => toast('Failed to load users', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleAction = async (
    action: (id: string) => Promise<void>,
    id: string,
    successMsg: string,
    failMsg: string
  ) => {
    setLoadingId(id);
    try {
      await action(id);
      toast(successMsg, 'success');
      const updated = await fetchAllUsers();
      setUsers(updated);
    } catch {
      toast(failMsg, 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const handleBanUser = (id: string, username: string) => {
    confirmAlert({
      title: 'Confirm Ban',
      message: `Ban ${username}?`,
      buttons: [
        {
          label: 'Yes',
          onClick: () =>
            handleAction(banUser, id, '🚫 User banned', '❌ Failed to ban user'),
        },
        { label: 'No' },
      ],
    });
  };

  if (loading) return <p>Loading users…</p>;

  return (
    <div className="glass-card p-4 space-y-2">
      {users.map((u) => (
        <div key={u.id} className="flex justify-between items-center border-b last:border-0 py-2">
          <div>
            <div className="font-medium">{u.username}</div>
            <div className="text-sm text-zinc-500">{u.email}</div>
          </div>

          <div className="flex gap-2">
            <GlassButton
              size="sm"
              onClick={() => handleAction(promoteUser, u.id, '✅ Promoted', '❌ Failed to promote')}
              disabled={loadingId === u.id}
            >
              {loadingId === u.id ? 'Promoting…' : 'Promote'}
            </GlassButton>
            <GlassButton
              size="sm"
              variant="secondary"
              onClick={() =>
                handleAction(resetPassword, u.id, '🔒 Password reset', '❌ Failed to reset')
              }
              disabled={loadingId === u.id}
            >
              {loadingId === u.id ? 'Resetting…' : 'Reset'}
            </GlassButton>
            <GlassButton
              size="sm"
              variant="danger"
              onClick={() => handleBanUser(u.id, u.username)}
              disabled={loadingId === u.id}
            >
              {loadingId === u.id ? 'Banning…' : 'Ban'}
            </GlassButton>
          </div>
        </div>
      ))}
    </div>
  );
}
