// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '@/components/layout/PageLayout';
import UserDashboardCard from '@/components/ui/UserDashboardCard';
import PageHeader from '@/components/ui/PageHeader';
import { useUser } from '@/hooks/useUser';
import { Star, Upload, Shield, LayoutDashboard } from 'lucide-react';
import axios from '@/api/client';

type ModelSummary = {
  id: string;
  name: string | null;
  created_at: string | null; // normalized string (ISO) or null
};

function firstTruthy<T = any>(obj: Record<string, any>, keys: string[]): T | null {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj?.[k] !== null) return obj[k] as T;
  }
  return null;
}

function normalizeDate(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === 'number') {
    const ms = input > 1e12 ? input : input * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof input === 'string') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function extractUploadedAt(model: any): string | null {
  const raw =
    firstTruthy(model, ['created_at', 'createdAt', 'uploaded_at', 'uploadedAt', 'created', 'timestamp']) ??
    firstTruthy(model, ['updated_at', 'updatedAt']);
  return normalizeDate(raw);
}

function formatUploadedDate(dateStr?: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Match the Cart/Browse card shell (grey glass, amber/red-orange ring, glossy top). */
function cardClasses(extra = '') {
  return [
    'relative overflow-visible rounded-2xl mw-led',
    'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
    'border border-amber-300/45 ring-1 ring-amber-300/40 hover:ring-amber-400/55',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
    'before:content-[""] before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none before:opacity-0 hover:before:opacity-100 before:transition-opacity',
    'before:shadow-[0_0_0_1px_rgba(251,146,60,0.12),0_0_12px_rgba(251,146,60,0.10),0_0_20px_rgba(251,146,60,0.08)]',
    extra,
  ].join(' ');
}

const Dashboard: React.FC = () => {
  const { user, isAdmin, loading, resolved, refresh } = useUser();

  // recent models (text-only)
  const [recentModels, setRecentModels] = useState<ModelSummary[]>([]);
  const [modelsLoading, setModelsLoading] = useState<boolean>(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    refresh?.().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRecentModels = async () => {
      setModelsLoading(true);
      setModelsError(null);
      try {
        // Assuming axios baseURL = /api/v1
        const res = await axios.get<{ items?: any[]; total?: number }>('/models', {
          params: { offset: 0, limit: 10 },
        });
        if (cancelled) return;

        const items = Array.isArray(res.data?.items) ? res.data.items : [];
        const mapped: ModelSummary[] = items
          .map((m) => {
            const created_at = extractUploadedAt(m);
            return {
              id: m.id,
              name: (m.name ?? 'Untitled') as string,
              created_at,
            };
          })
          .sort((a, b) => {
            const ta = a.created_at ? Date.parse(a.created_at) : 0;
            const tb = b.created_at ? Date.parse(b.created_at) : 0;
            return tb - ta;
          });

        setRecentModels(mapped);
      } catch (err) {
        console.error('[Dashboard] Failed to load recent models:', err);
        if (!cancelled) setModelsError('Failed to load recent models.');
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    };

    loadRecentModels();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !resolved) {
    return (
      <PageLayout>
        <div className="text-center text-zinc-500 dark:text-zinc-400 py-8">Loading your dashboard…</div>
      </PageLayout>
    );
  }

  if (!user) {
    return (
      <PageLayout>
        <div className="text-center text-red-600 dark:text-red-400 py-8">🚫 Please sign in to access your dashboard.</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <PageHeader icon={<LayoutDashboard className="w-8 h-8 text-zinc-400" />} title="Dashboard" />

        <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {/* User profile card already matches the look */}
          <UserDashboardCard />

          {/* Your Recent Uploads — apply amber/red-orange ring shell */}
          <div className={cardClasses('p-4')}>
            <div className="flex items-center gap-2 mb-2">
              <Upload className="w-5 h-5 text-amber-500/80" />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Your Recent Uploads</h2>
            </div>

            {modelsLoading ? (
              <div className="text-sm text-zinc-500">Loading…</div>
            ) : modelsError ? (
              <div className="text-sm text-red-600 dark:text-red-400">{modelsError}</div>
            ) : recentModels.length > 0 ? (
              <ul className="text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
                {recentModels.map((m) => {
                  const dateLabel = formatUploadedDate(m.created_at);
                  return (
                    <li key={m.id} className="truncate">
                      <Link
                        to={`/models/${m.id}`}
                        className="hover:underline text-amber-600 dark:text-amber-400"
                        title={m.name || 'Untitled'}
                      >
                        {m.name || 'Untitled'}
                      </Link>
                      <span
                        className="ml-2 text-xs text-zinc-500 dark:text-zinc-400"
                        title={m.created_at ?? undefined}
                      >
                        — {dateLabel ?? 'Unknown date'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-sm text-zinc-500">No models yet.</div>
            )}
          </div>

          {/* Favorites — replace DashboardCard with exact shell */}
          <Link to="/favorites" className={cardClasses('p-4 hover:before:opacity-100 block')}>
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-5 h-5 text-amber-500/80" />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Favorites</h2>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">See models you&apos;ve bookmarked.</p>
          </Link>

          {/* Admin Panel — same shell, only if admin */}
          {isAdmin && (
            <Link to="/admin" className={cardClasses('p-4 hover:before:opacity-100 block')}>
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-5 h-5 text-amber-500/80" />
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Admin Panel</h2>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Manage users, models, and pricing.</p>
            </Link>
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default Dashboard;
