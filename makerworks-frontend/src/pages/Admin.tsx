// src/pages/Admin.tsx
import { useMemo, useState, useEffect, useCallback, PropsWithChildren } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import PageLayout from '@/components/layout/PageLayout';
import { useUser } from '@/hooks/useUser';
import UsersTab from './admin/UsersTab';
import FilamentsTab from './admin/FilamentsTab';
import ModelsTab from './admin/ModelsTab';
import InventoryTab from './admin/InventoryTab';
import EstimatesTab from './admin/Estimates';
import Printers from './admin/Printers';
import BackupsTab from '@/pages/admin/BackupsTab';

// LED / visionOS theme
import '@/styles/mw-led.css';

// Konami + Arkanoid
import { useKonami } from '@/utils/useKonami';
import ArkanoidOverlay from '@/components/Arkanoid/ArkanoidOverlay';

type TabKey =
  | 'users'
  | 'filaments'
  | 'inventory'
  | 'models'
  | 'printers'
  | 'estimates'
  | 'backups'; // ← NEW

const TABS = [
  'users',
  'filaments',
  'inventory',
  'models',
  'printers',
  'estimates',
  'backups', // ← NEW (last so it won’t disrupt existing indexes)
] as const;

function isTab(value: unknown): value is TabKey {
  return typeof value === 'string' && (TABS as readonly string[]).includes(value);
}

/** VisionOS-style card wrapper with amber ring (matches Cart sections). */
function AdminPanelCard({
  id,
  active,
  children,
  className = '',
}: PropsWithChildren<{ id: string; active: boolean; className?: string }>) {
  return (
    <div id={id} role="tabpanel" aria-labelledby={`tab-${id.replace('panel-', '')}`} hidden={!active}>
      {/* mw-card = glass surface; mw-btn--amber sets the ring color for this section */}
      <section className={`mw-card mw-btn--amber p-4 ${className}`}>
        <div className="mw-led">{children}</div>
      </section>
    </div>
  );
}

export default function Admin() {
  const { user, isAdmin, loading } = useUser();
  const [showArkanoid, setShowArkanoid] = useState(false);
  useKonami(() => setShowArkanoid(true), { ignoreInputs: true });

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

  useEffect(() => {
    const current = searchParams.get('tab');
    if (current !== tab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab);
      setSearchParams(next, { replace: true });
    }
  }, [tab, searchParams, setSearchParams]);

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
      setTabSafe(TABS[nextIdx] as TabKey);
      const btn = document.getElementById(`tab-${TABS[nextIdx]}`);
      btn?.focus();
    },
    [currentIndex, setTabSafe]
  );

  if (loading) {
    return (
      <PageLayout title="Admin Panel">
        <p>Loading admin tools…</p>
      </PageLayout>
    );
  }

  if (!user) return <Navigate to="/auth/signin" replace />;
  if (!isAdmin) {
    return (
      <PageLayout title="Access Denied">
        <p>Admin access required.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Admin Panel" maxWidth="xl" padding="p-4">
      {/* Tab strip stays GREEN (default). No amber variant here. */}
      <div className="mw-led mb-4">
        <div
          role="tablist"
          aria-label="Admin sections"
          className="mw-admin-tabs flex flex-wrap gap-2"
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
                className={`mw-tab mw-btn-sm ${active ? 'is-active' : ''}`}
                onClick={() => setTabSafe(t as TabKey)}
                title="Tip: Up Up Down Down Left Right Left Right B A (Enter)"
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panels: each uses amber ring to match Cart’s section treatment */}
      <AdminPanelCard id="panel-users" active={tab === 'users'}>
        <UsersTab />
      </AdminPanelCard>

      <AdminPanelCard id="panel-filaments" active={tab === 'filaments'}>
        <FilamentsTab />
      </AdminPanelCard>

      <AdminPanelCard id="panel-inventory" active={tab === 'inventory'}>
        <InventoryTab />
      </AdminPanelCard>

      <AdminPanelCard id="panel-models" active={tab === 'models'}>
        <ModelsTab />
      </AdminPanelCard>

      <AdminPanelCard id="panel-printers" active={tab === 'printers'}>
        <Printers />
      </AdminPanelCard>

      <AdminPanelCard id="panel-estimates" active={tab === 'estimates'}>
        <EstimatesTab />
      </AdminPanelCard>

      <AdminPanelCard id="panel-backups" active={tab === 'backups'}>
        <BackupsTab />
      </AdminPanelCard>

      {showArkanoid && <ArkanoidOverlay onClose={() => setShowArkanoid(false)} />}
    </PageLayout>
  );
}
