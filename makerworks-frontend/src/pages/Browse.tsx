// src/pages/Browse.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from '@/api/axios';
import GlassCard from '@/components/ui/GlassCard';
import PageHeader from '@/components/ui/PageHeader';
import { Search } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useToast } from '@/context/ToastProvider';
import getAbsoluteUrl from '@/lib/getAbsoluteUrl';

interface Model {
  id: string;
  name: string | null;
  description: string | null;
  thumbnail_url: string | null;
  file_url: string | null;
  uploader_username: string | null;
  /** Added so we can pass the exact STL to ModelPage */
  stl_url?: string | null;
}

type SourceKey = 'local' | 'makerworld' | 'thingiverse' | 'printables' | 'thangs';

const SOURCES: { key: SourceKey; label: string }[] = [
  { key: 'local',       label: 'MakerWorks' },
  { key: 'makerworld',  label: 'Makerworld' },
  { key: 'thingiverse', label: 'Thingiverse' },
  { key: 'printables',  label: 'Printables' },
  { key: 'thangs',      label: 'Thangs' },
];

/** Backend origin resolver (no guessing games). */
const BACKEND_BASE =
  (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/api\/v1\/?$/, '') ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

/** Always send media to the backend origin; never 5173. */
function resolveMediaUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s; // already absolute

  if (s.startsWith('/thumbnails') || s.startsWith('/uploads') || s.startsWith('/static')) {
    return `${BACKEND_BASE}${s}`;
  }
  const viaHelper = getAbsoluteUrl(s);
  if (viaHelper) return viaHelper;
  return s.startsWith('/') ? s : `/${s}`;
}

/** VisionOS-y pill, emerald ring only (no glow) — reused for the Estimate button */
const ledClasses = (active: boolean = true) =>
  [
    // pill + layout
    'inline-flex h-10 w-full items-center justify-center rounded-full px-4 text-sm font-medium transition',
    // glass base
    'backdrop-blur-xl bg-white/70 dark:bg-white/10',
    // readable text
    'text-emerald-950 dark:text-emerald-200',
    // crisp emerald ring
    'border border-emerald-500/40 dark:border-emerald-400/35',
    // subtle inner highlight only (no external bloom)
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
    // interactive ring emphasis, still glow-free
    'hover:border-emerald-500/60 dark:hover:border-emerald-400/60',
    // states
    active ? 'cursor-pointer' : 'opacity-55 cursor-not-allowed',
  ].join(' ');

const Browse: React.FC = () => {
  const [models, setModels] = useState<Model[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SourceKey>('local');

  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const limit = 6;

  useEffect(() => {
    if (source === 'local') {
      setModels([]);
      setPage(1);
      setHasMore(true);
      setLoadingInitial(true);
      fetchModels(1, limit);
      if (user?.id) fetchFavorites();
    } else {
      redirectToExternal(source as Exclude<SourceKey, 'local'>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (page > 1 && source === 'local') {
      fetchModels(page, limit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, source]);

  type ListResponse = {
    total: number;
    items: any[];
    limit: number;
    offset: number;
  };

  const fetchModels = async (pageParam = 1, limitParam = limit) => {
    if (pageParam > 1) setLoadingMore(true);
    try {
      // API is offset/limit-based; compute offset from page
      const offset = (pageParam - 1) * limitParam;
      const url = `${BACKEND_BASE}/api/v1/models`;
      const res = await axios.get<ListResponse>(url, {
        params: { offset, limit: limitParam },
      });
      console.debug('[Browse] /models ->', res.status, res.data);

      const fetched: Model[] = (res.data.items || []).map((m) => {
        const defaultThumb = m?.id ? `/thumbnails/${m.id}.png` : null;
        const rawThumb = m.thumbnail_url || m.thumbnail_path || defaultThumb;

        // pick up either 'stl_url' or 'file_url' from API
        const rawFile = m.stl_url || m.file_url || null;
        const fileAbs = resolveMediaUrl(rawFile);

        return {
          id: m.id,
          name: m.name ?? null,
          description: m.description ?? null,
          thumbnail_url: resolveMediaUrl(rawThumb),
          file_url: fileAbs,     // keep for older consumers
          stl_url: fileAbs,      // use this when navigating to ModelPage
          uploader_username: m.uploader_username || null,
        } as Model;
      });

      setModels((prev) => (pageParam === 1 ? fetched : [...prev, ...fetched]));

      const nextCount = (pageParam - 1) * limitParam + fetched.length;
      setHasMore(nextCount < (res.data.total ?? nextCount));
    } catch (err) {
      console.error('[Browse] Failed to load models]:', err);
      toast.error('⚠️ Failed to load models. Please try again.');
      setError('Failed to load models');
      setHasMore(false);
    } finally {
      setLoadingInitial(false);
      if (pageParam > 1) setLoadingMore(false);
    }
  };

  const fetchFavorites = async () => {
    if (!user?.id) return;
    try {
      const res = await axios.get<string[]>(`${BACKEND_BASE}/api/v1/users/${user.id}/favorites`);
      setFavorites(new Set(res.data || []));
    } catch (err) {
      console.error('[Browse] Failed to load favorites:', err);
    }
  };

  const toggleFavorite = async (id: string) => {
    if (!user?.id) return;
    const isFav = favorites.has(id);
    const updated = new Set(favorites);
    isFav ? updated.delete(id) : updated.add(id);
    setFavorites(updated);

    try {
      const base = `${BACKEND_BASE}/api/v1`;
      if (isFav) {
        await axios.delete(`${base}/users/${user.id}/favorites/${id}`);
      } else {
        await axios.post(`${base}/users/${user.id}/favorites`, { modelId: id });
      }
    } catch (err) {
      console.error('[Browse] Failed to update favorite]:', err);
      const revert = new Set(favorites);
      setFavorites(revert);
      toast.error('⚠️ Failed to update favorite. Please try again.');
    }
  };

  // Open external sources in a new tab and reset the select back to "local".
  const redirectToExternal = (platform: Exclude<SourceKey, 'local'>) => {
    const urls: Record<Exclude<SourceKey, 'local'>, string> = {
      makerworld: 'https://makerworld.com',
      thingiverse: 'https://www.thingiverse.com',
      printables: 'https://www.printables.com',
      thangs: 'https://thangs.com',
    };
    const url = urls[platform];
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      toast.info('Popup blocked. Allow popups to open external sources in a new tab.');
    }
    setSource('local');
  };

  const filteredModels = useMemo(() => {
    const q = query.toLowerCase();
    return models.filter((model) => {
      const name = (model.name ?? '').toLowerCase();
      const desc = (model.description ?? '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [models, query]);

  const isLoading = loadingInitial;

  const navigateToModel = (m: Model) => {
    if (!m?.id) return;
    // record EXACT return location (page, filters, etc.)
    const from = `${location.pathname}${location.search}`;
    navigate(`/models/${m.id}`, {
      state: {
        preloaded: {
          id: m.id,
          name: m.name,
          description: m.description,
          thumbnail_url: m.thumbnail_url,
          stl_url: m.stl_url ?? m.file_url ?? null,
          uploader_username: m.uploader_username,
        },
        from, // used by ModelPage's Back button
      },
    });
  };

  // Green estimate button action (same payload shape as ModelPage)
  const navigateToEstimate = (m: Model) => {
    if (!m?.id) return;
    const payload = {
      id: m.id,
      name: m.name ?? null,
      description: m.description ?? null,
      src: m.stl_url ?? m.file_url ?? null,
      thumbnail_url: m.thumbnail_url ?? null,
    };
    navigate('/estimate', { state: { fromModel: payload, from: `${location.pathname}${location.search}` } });
  };

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <PageHeader
        icon={<Search className="w-8 h-8 text-zinc-400" />}
        title="Browse Models"
      />

      <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-center">
        <input
          type="text"
          placeholder="Search models…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="
            w-full sm:w-1/2 rounded-full px-4 py-2
            glass-card
            ring-1 ring-black/5 dark:ring-white/20
            text-sm text-zinc-800 dark:text-zinc-100
            placeholder:text-zinc-400
            focus:outline-none focus-visible:ring-black/10 dark:focus-visible:ring-white/20
            transition
          "
        />

        {/* VisionOS-style pill dropdown */}
        <div className="relative inline-flex items-center w-full sm:w-auto">
          <select
            aria-label="Source"
            value={source}
            onChange={(e) => setSource(e.target.value as SourceKey)}
            className="
              appearance-none
              w-full sm:w-[220px]
              px-4 pr-10 py-2 h-10
              rounded-full
              text-sm
              bg-white/60 dark:bg-white/10
              backdrop-blur-xl
              ring-1 ring-black/5 dark:ring-white/20
              border border-black/10 dark:border-white/15
              shadow-[inset_0_-1px_0_rgba(255,255,255,0.6),0_4px_12px_rgba(0,0,0,0.12)]
              text-zinc-800 dark:text-zinc-100
              hover:bg-white/70 dark:hover:bg-white/15
              focus:outline-none
              focus-visible:ring-2 focus-visible:ring-emerald-400/30
              transition
            "
          >
            {SOURCES.map(({ key, label }) => (
              <option key={key} value={key} className="bg-white dark:bg-zinc-900">
                {label}
              </option>
            ))}
          </select>

          {/* custom chevron */}
          <div
            className="
              pointer-events-none absolute inset-y-0 right-3 flex items-center
              text-zinc-700/70 dark:text-zinc-300/70
            "
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      {source === 'local' && (
        <>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {isLoading &&
              Array.from({ length: 6 }).map((_, idx) => (
                <GlassCard
                  key={`skeleton-${idx}`}
                  className="animate-pulse ring-1 ring-black/5 dark:ring-white/20"
                >
                  <div className="space-y-3">
                    <div className="w-full h-40 bg-zinc-300/20 dark:bg-zinc-600/20 rounded-md animate-pulse" />
                    <div className="h-4 bg-zinc-300/20 dark:bg-zinc-600/20 rounded w-3/4 animate-pulse" />
                    <div className="h-3 bg-zinc-300/20 dark:bg-zinc-600/20 rounded w-full animate-pulse" />
                  </div>
                </GlassCard>
              ))}

            {!isLoading && filteredModels.length === 0 && (
              <div className="col-span-full text-center text-gray-500 dark:text-gray-400">
                No models found.
              </div>
            )}

            {!isLoading &&
              filteredModels.map((model) => {
                const modelKey = model.id || model.file_url || Math.random().toString();
                const thumbUrl = resolveMediaUrl(
                  model.thumbnail_url || (model.id ? `/thumbnails/${model.id}.png` : null)
                );

                return (
                  <GlassCard
                    key={`model-${modelKey}`}
                    className="
                      relative cursor-pointer hover:scale-[1.02] transition-transform
                      ring-1 ring-black/5 dark:ring-white/20
                      hover:ring-black/10 dark:hover:ring-white/20
                    "
                    onClick={() => navigateToModel(model)}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (model.id) toggleFavorite(model.id);
                      }}
                      className="absolute top-2 right-2 text-yellow-400 hover:scale-110 transition"
                      aria-label="Favorite"
                    >
                      {model.id && favorites.has(model.id) ? '★' : '☆'}
                    </button>

                    {thumbUrl ? (
                      <img
                        key={`thumb-${modelKey}`}
                        src={thumbUrl}
                        alt={model.name ?? 'Model'}
                        className="rounded-md mb-2 w-full h-40 object-contain bg-white"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = `${BACKEND_BASE}/static/default-avatar.png`;
                        }}
                        draggable={false}
                      />
                    ) : (
                      <div
                        key={`placeholder-${modelKey}`}
                        className="w-full h-40 bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center rounded-md mb-2 text-sm text-zinc-500"
                      >
                        No preview available
                      </div>
                    )}

                    <h2 className="text-lg font-semibold mb-1">
                      {model.name || 'Untitled'}
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      {model.description || 'No description provided.'}
                    </p>

                    {model.uploader_username && (
                      <p
                        key={`uploader-${modelKey}`}
                        className="text-xs text-zinc-500 dark:text-zinc-400 mb-2"
                      >
                        Uploaded by <span className="font-medium">{model.uploader_username}</span>
                      </p>
                    )}

                    {/* Actions: perfectly symmetric buttons */}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToEstimate(model);
                        }}
                        className={ledClasses(true)}
                        aria-label="Get estimate"
                        title="Send this model to the estimator"
                      >
                        Get estimate →
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToModel(model);
                        }}
                        className={[
                          'inline-flex h-10 w-full items-center justify-center rounded-full px-4',
                          'text-sm font-medium text-center transition',
                          'bg-brand-red text-black shadow hover:bg-brand-blue',
                        ].join(' ')}
                        aria-label="View details"
                        title="View model details"
                      >
                        View Details →
                      </button>
                    </div>
                  </GlassCard>
                );
              })}
          </div>

          {hasMore && !isLoading && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={loadingMore}
                className="px-4 py-2 rounded-full bg-brand-red hover:bg-brand-blue transition text-black text-sm shadow disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
};

export default Browse;
