import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '@/api/axios';
import GlassCard from '@/components/ui/GlassCard';
import PageHeader from '@/components/ui/PageHeader';
import { Search } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useToast } from '@/context/ToastProvider';

interface Model {
  id: string;
  name: string | null;
  description: string | null;
  thumbnail_url: string | null;
  file_url: string | null;
  uploader_username: string | null;
}

const Browse: React.FC = () => {
  const [models, setModels] = useState<Model[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'local' | 'makerworld' | 'thingiverse' | 'printables' | 'thangs'>('local');

  const { user } = useAuthStore();
  const navigate = useNavigate();
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
      redirectToExternal(source);
    }
  }, [source]);

  useEffect(() => {
    if (page > 1 && source === 'local') {
      fetchModels(page, limit);
    }
  }, [page, source]);

  const fetchModels = async (pageParam = 1, limitParam = limit) => {
    if (pageParam > 1) setLoadingMore(true);
    try {
      const res = await axios.get<{ models: any[] }>('/models', {
        params: { page: pageParam, limit: limitParam },
      });

      console.log('[Browse] Raw API response:', res.data);

      const fetched: Model[] = (res.data.models || []).map((m) => ({
        id: m.id,
        name: m.name ?? null,
        description: m.description ?? null,
        thumbnail_url: m.thumbnail_url || m.thumbnail_path || null,
        file_url: m.file_url || null,
        uploader_username: m.uploader_username || null,
      }));

      console.log('[Browse] Parsed models:', fetched);

      setModels((prev) => (pageParam === 1 ? fetched : [...prev, ...fetched]));
      if (fetched.length < limitParam) setHasMore(false);
    } catch (err) {
      console.error('[Browse] Failed to load models:', err);
      toast.error('⚠️ Failed to load models. Please try again.');
      setError('Failed to load models');
    } finally {
      setLoadingInitial(false);
      if (pageParam > 1) setLoadingMore(false);
    }
  };

  const fetchFavorites = async () => {
    if (!user?.id) return;
    try {
      const res = await axios.get<string[]>(`/users/${user.id}/favorites`);
      setFavorites(new Set(res.data || []));
    } catch (err) {
      console.error('[Browse] Failed to load favorites:', err);
      toast.error('⚠️ Failed to load favorites. Please try again.');
    }
  };

  const toggleFavorite = async (id: string) => {
    if (!user?.id) return;
    const isFav = favorites.has(id);
    const updated = new Set(favorites);
    isFav ? updated.delete(id) : updated.add(id);
    setFavorites(updated);

    try {
      if (isFav) {
        await axios.delete(`/users/${user.id}/favorites/${id}`);
      } else {
        await axios.post(`/users/${user.id}/favorites`, { modelId: id });
      }
    } catch (err) {
      console.error('[Browse] Failed to update favorite:', err);
      toast.error('⚠️ Failed to update favorite. Please try again.');
    }
  };

  const redirectToExternal = (platform: string) => {
    const urls: Record<string, string> = {
      makerworld: 'https://makerworld.com',
      thingiverse: 'https://www.thingiverse.com',
      printables: 'https://www.printables.com',
      thangs: 'https://thangs.com',
    };
    window.location.href = urls[platform];
  };

  const filteredModels = models.filter((model) => {
    const name = model.name ?? '';
    const desc = model.description ?? '';
    return (
      name.toLowerCase().includes(query.toLowerCase()) ||
      desc.toLowerCase().includes(query.toLowerCase())
    );
  });

  const isLoading = loadingInitial;

  const handleViewModel = (id?: string) => {
    if (!id) return;
    navigate(`/models/${id}`);
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
          className="w-full sm:w-1/2 rounded-full px-4 py-2 glass-card border text-sm shadow placeholder:text-zinc-400 focus:outline-none"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          className="w-full sm:w-1/4 rounded-full px-4 py-2 glass-card border text-sm shadow focus:outline-none"
        >
          <option value="local">MakerWorks (Local)</option>
          <option disabled>—— External Links ——</option>
          <option value="makerworld">Makerworld</option>
          <option value="thingiverse">Thingiverse</option>
          <option value="printables">Printables</option>
          <option value="thangs">Thangs</option>
        </select>
      </div>

      {source === 'local' && (
        <>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {isLoading &&
              Array.from({ length: 6 }).map((_, idx) => (
                <GlassCard key={`skeleton-${idx}`} className="animate-pulse">
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

                // 🔍 Debug logs
                console.log('[Browse] Model data:', model);

                let thumbUrl: string | null = null;
                if (model.thumbnail_url != null) {
                  const raw = String(model.thumbnail_url).trim();
                  console.log('[Browse] Raw thumbnail path:', raw);
                  if (raw !== '') {
                    if (raw.startsWith('http')) {
                      thumbUrl = raw;
                    } else {
                      const normalized = raw.replace(/^\.?\/*/, '');
                      thumbUrl = `/${normalized}`;
                    }
                  }
                }

                console.log('[Browse] Final thumbnail URL:', thumbUrl);

                return (
                  <GlassCard
                    key={`model-${modelKey}`}
                    className="relative cursor-pointer hover:scale-[1.02] transition-transform"
                    onClick={() => handleViewModel(model.id)}
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
                        className="rounded-md mb-2 w-full h-40 object-cover"
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

                    <p className="mt-2 w-full py-1.5 rounded-full bg-brand-primary text-center text-black text-sm shadow">
                      View Details →
                    </p>
                  </GlassCard>
                );
              })}
          </div>

          {hasMore && !isLoading && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={loadingMore}
                className="px-4 py-2 rounded-full bg-brand-primary hover:bg-brand-highlight transition text-black text-sm shadow disabled:opacity-50"
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
