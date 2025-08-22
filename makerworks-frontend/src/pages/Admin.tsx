// src/pages/Admin.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '@/components/layout/PageLayout';
import { useUser } from '@/hooks/useUser';
import UsersTab from './admin/UsersTab';
import FilamentsTab from './admin/FilamentsTab';
import ModelsTab from './admin/ModelsTab';
import InventoryTab from './admin/InventoryTab';

type TabKey = 'users' | 'filaments' | 'inventory' | 'models';
const TABS: readonly TabKey[] = ['users', 'filaments', 'inventory', 'models'] as const;

export default function Admin() {
  const { user, isAdmin, loading } = useUser();
  const [tab, setTab] = useState<TabKey>('users');
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/auth/signin');
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

  const currentIndex = useMemo(() => TABS.indexOf(tab), [tab]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    let nextIdx = currentIndex;
    if (e.key === 'ArrowRight') nextIdx = (currentIndex + 1) % TABS.length;
    if (e.key === 'ArrowLeft')  nextIdx = (currentIndex - 1 + TABS.length) % TABS.length;
    if (e.key === 'Home')       nextIdx = 0;
    if (e.key === 'End')        nextIdx = TABS.length - 1;
    setTab(TABS[nextIdx]);
    const btn = document.getElementById(`tab-${TABS[nextIdx]}`);
    btn?.focus();
  }

  return (
    <PageLayout title="Admin Panel" maxWidth="xl" padding="p-4">
      {/* Tabs = actual buttons with green LED ring; whole container manages roving focus */}
      <div
        role="tablist"
        aria-label="Admin sections"
        className="mw-admin-tabs mb-4 flex flex-wrap gap-2"
        onKeyDown={onKeyDown}
      >
        {TABS.map((t) => {
          const active = tab === t;
          const label = t.charAt(0).toUpperCase() + t.slice(1);
          return (
            <button
              key={t}
              id={`tab-${t}`}
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${t}`}
              data-active={active ? 'true' : 'false'}
              className="mw-enter mw-btn-sm rounded-full font-medium text-gray-800 dark:text-gray-200"
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Panels (keep your orange/amber card styles INSIDE each tab component) */}
      <div id="panel-users" role="tabpanel" aria-labelledby="tab-users" hidden={tab !== 'users'}>
        {tab === 'users' && <UsersTab />}
      </div>
      <div id="panel-filaments" role="tabpanel" aria-labelledby="tab-filaments" hidden={tab !== 'filaments'}>
        {tab === 'filaments' && <FilamentsTab />}
      </div>
      <div id="panel-inventory" role="tabpanel" aria-labelledby="tab-inventory" hidden={tab !== 'inventory'}>
        {tab === 'inventory' && <InventoryTab />}
      </div>
      <div id="panel-models" role="tabpanel" aria-labelledby="tab-models" hidden={tab !== 'models'}>
        {tab === 'models' && <ModelsTab />}
      </div>

      {/* Turn up the LED for the active tab, locally (no global side effects) */}
      <style>{`
        .mw-admin-tabs .mw-enter[data-active="true"]{
          border-color:#16a34a !important;
          box-shadow:
            inset 0 0 12px 2.5px rgba(22,163,74,0.60),
            0 0 18px 6px rgba(22,163,74,0.65),
            0 0 36px 14px rgba(22,163,74,0.28);
          transform: none;
        }
      `}</style>
    </PageLayout>
  );
}
