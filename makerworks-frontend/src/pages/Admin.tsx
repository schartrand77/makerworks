// src/pages/Admin.tsx
import { useMemo, useState, useEffect, useCallback } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import PageLayout from '@/components/layout/PageLayout';
import { useUser } from '@/hooks/useUser';
import UsersTab from './admin/UsersTab';
import FilamentsTab from './admin/FilamentsTab';
import ModelsTab from './admin/ModelsTab';
import InventoryTab from './admin/InventoryTab';

type TabKey = 'users' | 'filaments' | 'inventory' | 'models';
const TABS = ['users', 'filaments', 'inventory', 'models'] as const;

function isTab(value: unknown): value is TabKey {
  return typeof value === 'string' && (TABS as readonly string[]).includes(value);
}

export default function Admin() {
  // ✅ Hooks are always called, in a fixed order
  const { user, isAdmin, loading } = useUser();

  // URL <-> state sync for tab
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFromUrl = searchParams.get('tab');
  const initialFromStorage = (typeof window !== 'undefined'
    ? window.sessionStorage.getItem('mw.admin.tab')
    : null) as TabKey | null;

  const initialTab: TabKey =
    (isTab(initialFromUrl) && (initialFromUrl as TabKey)) ||
    (isTab(initialFromStorage) && (initialFromStorage as TabKey)) ||
    'users';

  const [tab, setTab] = useState<TabKey>(initialTab);

  // Keep URL in sync (without adding history entries on every click)
  useEffect(() => {
    const current = searchParams.get('tab');
    if (current !== tab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab);
      setSearchParams(next, { replace: true });
    }
  }, [tab, searchParams, setSearchParams]);

  // Persist last tab for refreshes where URL might not be preserved (e.g. manual nav)
  useEffect(() => {
    try {
      window.sessionStorage.setItem('mw.admin.tab', tab);
    } catch {}
  }, [tab]);

  const currentIndex = useMemo(() => TABS.indexOf(tab), [tab]);

  const setTabSafe = useCallback((value: TabKey) => {
    if (isTab(value)) setTab(value);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      let nextIdx = currentIndex;
      if (e.key === 'ArrowRight') nextIdx = (currentIndex + 1) % TABS.length;
      if (e.key === 'ArrowLeft') nextIdx = (currentIndex - 1 + TABS.length) % TABS.length;
      if (e.key === 'Home') nextIdx = 0;
      if (e.key === 'End') nextIdx = TABS.length - 1;
      setTabSafe(TABS[nextIdx]);
      const btn = document.getElementById(`tab-${TABS[nextIdx]}`);
      btn?.focus();
    },
    [currentIndex, setTabSafe]
  );

  // ⏳ Initial loading state
  if (loading) {
    return (
      <PageLayout title="Admin Panel">
        <p>Loading admin tools…</p>
      </PageLayout>
    );
  }

  // 🚪 Redirect unauthenticated users (after the initial load)
  if (!user) {
    return <Navigate to="/auth/signin" replace />;
  }

  // 🚫 Authenticated but not an admin
  if (!isAdmin) {
    return (
      <PageLayout title="Access Denied">
        <p>Admin access required.</p>
      </PageLayout>
    );
  }

  // ✅ Authenticated admin view
  return (
    <PageLayout title="Admin Panel" maxWidth="xl" padding="p-4">
      {/* Tabs: roving focus via keyboard, LED ring on active */}
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
              onClick={() => setTabSafe(t)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Panels (render only the active tab’s content) */}
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

      {/* Local LED glow for the active tab */}
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
