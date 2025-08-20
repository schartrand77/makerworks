// src/pages/Admin.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '@/components/layout/PageLayout';
import GlassButton from '@/components/ui/GlassButton';
import { useUser } from '@/hooks/useUser';
import UsersTab from './admin/UsersTab';
import FilamentsTab from './admin/FilamentsTab';
import ModelsTab from './admin/ModelsTab';
import InventoryTab from './admin/InventoryTab'; // 👈 NEW

export default function Admin() {
  const { user, isAdmin, loading } = useUser();
  const [tab, setTab] = useState<'users' | 'filaments' | 'inventory' | 'models'>('users'); // 👈 add 'inventory'
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      console.warn('[Admin] No user & not loading — redirecting to signin.');
      navigate('/auth/signin');
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <PageLayout title="Admin Panel">
        <p>Loading admin tools…</p>
      </PageLayout>
    );
  }

  if (!user || !isAdmin) {
    return (
      <PageLayout title="Access Denied">
        <p>Admin access required.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Admin Panel" maxWidth="xl" padding="p-4">
      <div className="mb-4 flex gap-3">
        {(['users', 'filaments', 'inventory', 'models'] as const).map((t) => (
          <GlassButton
            key={t}
            variant={tab === t ? 'primary' : 'secondary'}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </GlassButton>
        ))}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'filaments' && <FilamentsTab />}
      {tab === 'inventory' && <InventoryTab />}{/* 👈 NEW */}
      {tab === 'models' && <ModelsTab />}
    </PageLayout>
  );
}
