// src/pages/Browse.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from '@/api/client';
import { Search as SearchIcon } from 'lucide-react';
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

const BACKEND_BASE =
  (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/api\/v1\/?$/, '') ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

function resolveMediaUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;

  if (s.startsWith('/thumbnails') || s.startsWith('/uploads') || s.startsWith('/static')) {
    return `${BACKEND_BASE}${s}`;
  }
  const viaHelper = getAbsoluteUrl(s);
  if (viaHelper) return viaHelper;
  return s.startsWith('/') ? s : `/${s}`;
}

type ListResponse = {
  total: number;
  items: any[];
  limit: number;
  offset: number;
};

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

  const limit = 9;

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

  const fetchModels = async (pageParam = 1, limitParam = limit) => {
    if (pageParam > 1) setLoadingMore(true);
    try {
      const offset = (pageParam - 1) * limitParam;
      const url = `${BACKEND_BASE}/api/v1/models`;
      const res = await axios.get<ListResponse>(url, { params: { offset, limit: limitParam } });
      console.debug('[Browse] /models ->', res.status, res.data);

      const fetched: Model[] = (res.data.items || []).map((m) => {
        const defaultThumb = m?.id ? `/thumbnails/${m.id}.png` : null;
        const rawThumb = m.thumbnail_url || m.thumbnail_path || defaultThumb;

        const rawFile = m.stl_url || m.file_url || null;
        const fileAbs = resolveMediaUrl(rawFile);

        return {
          id: m.id,
          name: m.name ?? null,
          description: m.description ?? null,
          thumbnail_url: resolveMediaUrl(rawThumb),
          file_url: fileAbs,
          stl_url: fileAbs,
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
      console.error('[Browse] Failed to load favorites]:', err);
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

  const redirectToExternal = (platform: Exclude<SourceKey, 'local'>) => {
    const urls: Record<Exclude<SourceKey, 'local'>, string> = {
      makerworld: 'https://makerworld.com',
      thingiverse: 'https://www.thingiverse.com',
      printables: 'https://www.printables.com',
      thangs: 'https://thangs.com',
    };
    const url = urls[platform];
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) toast.info('Popup blocked. Allow popups to open external sources in a new tab.');
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
        from,
      },
    });
  };

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
    <main className="page-wrap compact-page space-y-5">
      {/* Page Title */}
      <h1 className="page-title">
        <SearchIcon className="w-6 h-6 text-zinc-400" />
        <span className="title-chip">Browse Models</span>
      </h1>

      {/* Controls — removed grey container: no 'section' class, no background */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center bg-transparent">
        {/* Search input — pill with persistent orange rim */}
        <input
          type="text"
          placeholder="Search models…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={[
            'glass-input rounded-full sm:flex-1',
            'ring-1 ring-amber-400/40 border-amber-300/60',
            'shadow-[inset_0_0_6px_rgba(251,146,60,0.18),inset_0_0_1px_rgba(251,146,60,0.30),0_0_8px_rgba(251,146,60,0.14)]',
            'focus:ring-amber-400/60 focus:border-amber-400/60',
            'bg-transparent', // ensure no grey block
          ].join(' ')}
          aria-label="Search models"
        />

        {/* Source select — pill with persistent orange rim */}
        <div className="relative inline-flex items-center w-full sm:w-auto bg-transparent">
          <select
            aria-label="Source"
            value={source}
            onChange={(e) => setSource(e.target.value as SourceKey)}
            className={[
              'glass-input rounded-full w-full sm:w-[220px] h-9 pr-9 appearance-none',
              'ring-1 ring-amber-400/40 border-amber-300/60',
              'shadow-[inset_0_0_6px_rgba(251,146,60,0.18),inset_0_0_1px_rgba(251,146,60,0.30),0_0_8px_rgba(251,146,60,0.14)]',
              'focus:ring-amber-400/60 focus:border-amber-400/60',
              'bg-transparent', // ensure no grey block
            ].join(' ')}
          >
            {SOURCES.map(({ key, label }) => (
              <option key={key} value={key} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                {label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-700/70 dark:text-zinc-300/70">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Grid */}
      {source === 'local' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="list" aria-label="Model results">
            {isLoading &&
              Array.from({ length: 8 }).map((_, idx) => (
                <div key={`skeleton-${idx}`} className="card card--rim-orange animate-pulse p-3" role="listitem">
                  <div className="space-y-3">
                    <div className="w-full aspect-[4/3] bg-zinc-300/20 dark:bg-zinc-600/20 rounded-lg" />
                    <div className="h-4 bg-zinc-300/20 dark:bg-zinc-600/20 rounded w-3/4" />
                    <div className="h-3 bg-zinc-300/20 dark:bg-zinc-600/20 rounded w-full" />
                  </div>
                </div>
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
                  <article
                    key={`model-${modelKey}`}
                    className="card card--rim-orange p-3 relative cursor-pointer hover:scale-[1.015] transition-transform"
                    role="listitem"
                    onClick={() => navigateToModel(model)}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (model.id) toggleFavorite(model.id);
                      }}
                      className="absolute top-2 right-2 text-yellow-400 hover:scale-110 transition"
                      aria-label="Favorite"
                      title="Toggle favorite"
                    >
                      {model.id && favorites.has(model.id) ? '★' : '☆'}
                    </button>

                    <div className="rounded-lg mb-2 w-full aspect-[4/3] bg-white/70 dark:bg-white/10 grid place-items-center overflow-hidden border border-white/20">
                      {thumbUrl ? (
                        <img
                          key={`thumb-${modelKey}`}
                          src={thumbUrl}
                          alt={model.name ?? 'Model'}
                          className="w-full h-full object-contain p-3"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = `${BACKEND_BASE}/static/default-avatar.png`;
                          }}
                          draggable={false}
                        />
                      ) : (
                        <div className="text-sm text-zinc-500">No preview available</div>
                      )}
                    </div>

                    <h2 className="text-[15px] font-extrabold mb-0.5">{model.name || 'Untitled'}</h2>
                    <p className="text-[12px] mb-1 line-clamp-2">
                      {model.description || 'No description provided.'}
                    </p>

                    {model.uploader_username && (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-2">
                        Uploaded by <span className="font-semibold">{model.uploader_username}</span>
                      </p>
                    )}

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToEstimate(model);
                        }}
                        className="btn btn--neon btn--sm text-brand-text text-[12px]"
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
                        className="btn btn--neon btn--ghost btn--sm text-brand-text text-[12px]"
                        aria-label="View details"
                        title="View model details"
                      >
                        View details →
                      </button>
                    </div>
                  </article>
                );
              })}
          </div>

          {hasMore && !isLoading && (
            <div className="mt-5 text-center">
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={loadingMore}
                className="btn btn--neon btn--sm text-brand-text text-[12px] px-4 rounded-full"
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
