import { useEffect, useState } from 'react';
import GlassInput from '@/components/ui/GlassInput';
import GlassButton from '@/components/ui/GlassButton';
import { useToast } from '@/hooks/useToast';
import { fetchAllModels, updateModel, Model } from '@/api/admin';

export default function ModelsTab() {
  const { toast } = useToast();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAllModels()
      .then(setModels)
      .catch(() => toast('Failed to load models', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleSave = async (m: Model) => {
    setLoadingId(m.id);
    try {
      await updateModel(m.id, m);
      toast('✅ Model updated', 'success');
    } catch {
      toast('❌ Failed to update', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  if (loading) return <p>Loading models…</p>;

  return (
    <div className="glass-card p-4 space-y-2">
      {models.map((m) => (
        <div key={m.id} className="flex gap-2">
          <GlassInput
            label="Name"
            value={m.name || ''}
            onChange={(e) => setModels((prev) =>
              prev.map((x) => x.id === m.id ? { ...x, name: e.target.value } : x)
            )}
          />
          <GlassInput
            label="Description"
            value={m.description || ''}
            onChange={(e) => setModels((prev) =>
              prev.map((x) => x.id === m.id ? { ...x, description: e.target.value } : x)
            )}
          />
          <GlassButton onClick={() => handleSave(m)} disabled={loadingId === m.id}>
            {loadingId === m.id ? 'Saving…' : 'Save'}
          </GlassButton>
        </div>
      ))}
    </div>
  );
}
