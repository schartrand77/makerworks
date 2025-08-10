// src/pages/Upload.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '@/api/axios';
import GlassCard from '@/components/ui/GlassCard';
import PageHeader from '@/components/ui/PageHeader';
import { useToast } from '@/context/ToastProvider';
import { UploadCloud } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

const MAX_SIZE = 200 * 1024 * 1024; // 200MB
const ACCEPT = '.stl,.3mf,model/stl,model/3mf,application/octet-stream';

const Upload: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const { token } = useAuthStore();
  const toast = useToast();
  const navigate = useNavigate();

  const onChoose = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'));
    if (!['.stl', '.3mf'].includes(ext)) {
      toast.error('Only .stl or .3mf files are allowed.');
      e.currentTarget.value = '';
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error('File too large (max 200MB).');
      e.currentTarget.value = '';
      return;
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.(stl|3mf)$/i, ''));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('Pick a file first.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      // If your backend accepts name/description, include them; if not, harmless.
      if (name) fd.append('name', name);
      if (desc) fd.append('description', desc);

      const res = await axios.post('/upload/', fd, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        withCredentials: true,
      });

      // ✅ Option B: treat status (201/2xx) OR presence of an id as success
      const ok =
        (res.status >= 200 && res.status < 300) ||
        !!res.data?.id ||
        !!res.data?.model?.id;

      if (!ok) {
        throw new Error('Upload response missing id');
      }

      const model = res.data?.model ?? res.data;
      const modelId = model?.id;
      if (!modelId) {
        // We still consider it success if 2xx, but we can’t route without id
        toast.success('Model uploaded, but no ID returned.');
        return;
      }

      toast.success('✅ Model uploaded!');
      navigate(`/models/${modelId}`);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 413) {
        toast.error('File too large for server.');
      } else if (status === 400) {
        toast.error(`Upload rejected: ${detail ?? 'Bad request'}`);
      } else if (status === 401) {
        toast.error('Sign in required.');
      } else if (status === 404) {
        toast.error('Upload endpoint not found (POST /api/v1/upload/).');
      } else {
        toast.error('Upload failed. Please try again.');
      }
      // eslint-disable-next-line no-console
      console.error('[Upload]', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <PageHeader icon={<UploadCloud className="w-8 h-8 text-zinc-400" />} title="Upload a Model" />
      <GlassCard className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1">Model file (.stl / .3mf)</label>
            <input
              type="file"
              accept={ACCEPT}
              onChange={onChoose}
              className="block w-full text-sm file:mr-3 file:px-4 file:py-2 file:rounded-full file:border-0 file:bg-brand-primary file:text-black file:cursor-pointer"
            />
            {file && (
              <p className="mt-2 text-xs text-zinc-500">
                {file.name} • {(file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional title for your model"
              className="w-full rounded-lg px-3 py-2 border bg-white/60 dark:bg-zinc-900/60"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Optional description…"
              className="w-full rounded-lg px-3 py-2 border bg-white/60 dark:bg-zinc-900/60"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy || !file}
              className="px-5 py-2 rounded-full bg-brand-primary text-black disabled:opacity-50"
            >
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </GlassCard>
    </main>
  );
};

export default Upload;
