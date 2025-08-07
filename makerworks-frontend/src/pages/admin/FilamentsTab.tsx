import { useEffect, useState } from 'react';
import GlassInput from '@/components/ui/GlassInput';
import GlassButton from '@/components/ui/GlassButton';
import { useToast } from '@/hooks/useToast';
import {
  fetchAvailableFilaments,
  addFilament,
  updateFilament,
  deleteFilament,
  type Filament,
} from '@/api/filaments';
import { confirmAlert } from 'react-confirm-alert';

export default function FilamentsTab() {
  const { toast } = useToast();
  const [filaments, setFilaments] = useState<Filament[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [newFilament, setNewFilament] = useState<Omit<Filament, 'id'>>({ type: '', color: '', hex: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAvailableFilaments()
      .then(setFilaments)
      .catch(() => toast('Failed to load filaments', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const reload = async () => {
    const data = await fetchAvailableFilaments();
    setFilaments(data);
  };

  const handleSave = async (f: Filament) => {
    setLoadingId(f.id);
    try {
      await updateFilament(f.id, f);
      toast('✅ Filament updated', 'success');
      await reload();
      setEditingId(null);
    } catch {
      toast('❌ Failed to update', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const handleAdd = async () => {
    if (!newFilament.type) return;
    setLoadingId('new');
    try {
      await addFilament(newFilament);
      toast('✅ Added', 'success');
      setNewFilament({ type: '', color: '', hex: '' });
      await reload();
    } catch {
      toast('❌ Failed to add', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = (id: string) => {
    confirmAlert({
      title: 'Confirm Delete',
      message: 'Delete this filament?',
      buttons: [
        {
          label: 'Yes',
          onClick: async () => {
            setLoadingId(id);
            try {
              await deleteFilament(id);
              toast('✅ Deleted', 'success');
              await reload();
            } catch {
              toast('❌ Failed to delete', 'error');
            } finally {
              setLoadingId(null);
            }
          },
        },
        { label: 'No' },
      ],
    });
  };

  if (loading) return <p>Loading filaments…</p>;

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex gap-2">
        {['type', 'color', 'hex'].map((k) => (
          <GlassInput
            key={k}
            label={k}
            value={(newFilament as any)[k] || ''}
            onChange={(e) => setNewFilament({ ...newFilament, [k]: e.target.value })}
          />
        ))}
        <GlassButton onClick={handleAdd} disabled={loadingId === 'new'}>
          {loadingId === 'new' ? 'Adding…' : 'Add'}
        </GlassButton>
      </div>

      <div className="glass-card p-4 space-y-2">
        {filaments.map((f) =>
          editingId !== f.id ? (
            <div key={f.id} className="flex justify-between items-center">
              <div>{f.type} – {f.color} <span style={{ color: f.hex }}>●</span></div>
              <div className="flex gap-2">
                <GlassButton onClick={() => setEditingId(f.id)}>Edit</GlassButton>
                <GlassButton variant="danger" onClick={() => handleDelete(f.id)}>Delete</GlassButton>
              </div>
            </div>
          ) : (
            <div key={f.id} className="flex gap-2">
              {['type', 'color', 'hex'].map((k) => (
                <GlassInput
                  key={k}
                  label={k}
                  value={(f as any)[k]}
                  onChange={(e) =>
                    setFilaments((prev) =>
                      prev.map((item) =>
                        item.id === f.id ? { ...item, [k]: e.target.value } : item
                      )
                    )
                  }
                />
              ))}
              <GlassButton onClick={() => handleSave(f)}>Save</GlassButton>
              <GlassButton onClick={() => setEditingId(null)}>Cancel</GlassButton>
            </div>
          )
        )}
      </div>
    </div>
  );
}
