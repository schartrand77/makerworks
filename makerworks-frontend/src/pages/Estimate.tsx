// src/pages/Upload.tsx — makerworks
import { useEffect, useMemo, useRef, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import ModelViewer from '@/components/ui/ModelViewer'
import axios from '@/api/client'
import { toast } from 'sonner'
import clsx from 'clsx'
import { UploadCloud, X, FileUp } from 'lucide-react'

type LocalModel = {
  name: string
  description: string
  file: File | null
  objectUrl: string | null
}

const ACCEPT = [
  '.stl', '.glb', '.gltf', '.obj', '.3mf'
].join(',')

export default function Upload() {
  const [model, setModel] = useState<LocalModel>({
    name: '',
    description: '',
    file: null,
    objectUrl: null,
  })
  const [submitting, setSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Clean up object URL
  useEffect(() => {
    return () => {
      if (model.objectUrl) URL.revokeObjectURL(model.objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canSubmit = useMemo(() => {
    return !!model.file && model.name.trim().length > 0
  }, [model.file, model.name])

  const pickFile = () => inputRef.current?.click()

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const f = files[0]
    // rudimentary filter
    const ok =
      f.name.match(/\.(stl|glb|gltf|obj|3mf)$/i) ||
      ['model/gltf-binary', 'model/gltf+json', 'application/sla', 'application/octet-stream'].includes(f.type)

    if (!ok) {
      toast.error('Unsupported file. Use .stl, .glb, .gltf, .obj, or .3mf')
      return
    }

    // Revoke any previous URL
    if (model.objectUrl) URL.revokeObjectURL(model.objectUrl)
    const url = URL.createObjectURL(f)

    setModel(m => ({
      ...m,
      file: f,
      objectUrl: url,
      name: m.name || f.name.replace(/\.[^.]+$/, ''),
    }))
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const onBrowseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
    // reset so same file can be chosen twice
    e.currentTarget.value = ''
  }

  const clearFile = () => {
    if (model.objectUrl) URL.revokeObjectURL(model.objectUrl)
    setModel(m => ({ ...m, file: null, objectUrl: null }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !model.file) return

    try {
      setSubmitting(true)
      const fd = new FormData()
      fd.append('file', model.file)
      fd.append('name', model.name.trim())
      fd.append('description', model.description.trim())

      // Adjust endpoint to your backend if different:
      const res = await axios.post('/models/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('✅ Upload complete')
      // you might want to navigate to /browse or /model/:id using res.data
    } catch (err: any) {
      console.error('[Upload] Failed', err)
      toast.error('❌ Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <PageHeader icon={<FileUp className="w-8 h-8 text-zinc-400" />} title="Upload Model" />

        <form onSubmit={submit} className="grid lg:grid-cols-2 gap-6">
          {/* LEFT: Dropzone + Viewer */}
          <GlassCard
            className={clsx(
              'p-4 mw-led relative',
              dragOver && 'ring-2 ring-emerald-400'
            )}
            onDragOver={(e: any) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Model File</h2>
              {model.file && (
                <button
                  type="button"
                  onClick={clearFile}
                  className="mw-enter mw-btn-sm rounded-full font-medium text-gray-800 dark:text-gray-200"
                  title="Remove file"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </span>
                </button>
              )}
            </div>

            {/* Drop area */}
            <div
              role="button"
              tabIndex={0}
              onClick={pickFile}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pickFile()}
              className={clsx(
                'rounded-xl border border-dashed',
                'border-zinc-300/70 dark:border-zinc-600/70',
                'bg-white/50 dark:bg-white/10 backdrop-blur',
                'p-4 grid place-items-center text-center cursor-pointer select-none'
              )}
            >
              {!model.file ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <UploadCloud className="w-8 h-8 opacity-70" />
                  <div className="text-sm text-zinc-700 dark:text-zinc-300">
                    Drag & drop a 3D file here, or <span className="underline">browse</span>
                  </div>
                  <div className="text-xs text-zinc-500">Accepted: {ACCEPT.replace(/,/g, ', ')}</div>
                </div>
              ) : (
                <div className="w-full">
                  {/* Viewer frame matches Browse/Cart: rounded, subtle ring, overflow-hidden */}
                  <div className="aspect-[16/9] rounded-xl bg-white/50 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10 mb-3 grid place-items-center overflow-hidden">
                    <ModelViewer
                      src={model.objectUrl || undefined}
                      color="#9a9a9a"
                      fitMargin={1.6}
                      className="w-full h-full rounded-xl"
                    />
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                    {model.file.name} • {(model.file.size / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={onBrowseChange}
              />
            </div>

            {/* Viewer controls hint */}
            {model.file && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs select-none text-zinc-700 dark:text-zinc-300">
                <span className="px-2.5 py-1 rounded-full backdrop-blur-xl bg-white/60 dark:bg-white/10 border border-black/10 dark:border-white/15">
                  <strong className="font-medium">Left-drag</strong>
                  <span className="opacity-70"> · rotate</span>
                </span>
                <span className="px-2.5 py-1 rounded-full backdrop-blur-xl bg-white/60 dark:bg-white/10 border border-black/10 dark:border-white/15">
                  <strong className="font-medium">Right-drag</strong>
                  <span className="opacity-70"> · pan</span>
                </span>
                <span className="px-2.5 py-1 rounded-full backdrop-blur-xl bg-white/60 dark:bg-white/10 border border-black/10 dark:border-white/15">
                  <strong className="font-medium">Scroll</strong>
                  <span className="opacity-70"> · zoom</span>
                </span>
              </div>
            )}
          </GlassCard>

          {/* RIGHT: Metadata + Submit */}
          <GlassCard className="p-4 mw-led">
            <h2 className="text-lg font-semibold mb-3">Details</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-1">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={model.name}
                  onChange={(e) => setModel(m => ({ ...m, name: e.target.value }))}
                  placeholder="e.g., Benchy v2"
                  className="w-full rounded-full border p-2 px-4 dark:bg-zinc-800 bg-white/80 text-zinc-800 dark:text-zinc-100"
                  required
                />
              </div>

              <div>
                <label htmlFor="desc" className="block text-sm font-medium mb-1">
                  Description <span className="text-xs text-zinc-500">(optional)</span>
                </label>
                <textarea
                  id="desc"
                  value={model.description}
                  onChange={(e) => setModel(m => ({ ...m, description: e.target.value }))}
                  rows={4}
                  placeholder="What is this model?"
                  className="w-full rounded-2xl border p-3 dark:bg-zinc-800 bg-white/80 text-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={!canSubmit || submitting}
                  className="mw-enter mw-enter--slim rounded-full font-medium text-gray-800 dark:text-gray-200 disabled:opacity-60"
                >
                  {submitting ? 'Uploading…' : 'Upload'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearFile()
                    setModel({ name: '', description: '', file: null, objectUrl: null })
                  }}
                  className="mw-enter mw-btn-sm rounded-full font-medium text-gray-800 dark:text-gray-200"
                >
                  Reset
                </button>
              </div>

              {!canSubmit && (
                <p className="text-xs text-zinc-500">Pick a file and give it a name to upload.</p>
              )}
            </div>
          </GlassCard>
        </form>
      </div>

      {/* Keep our house style: amber/grey card shell; green LED buttons; card halos on hover */}
      <style>{`
        /* --- LED green token --- */
        .mw-enter { --mw-ring: #16a34a; } /* Tailwind green-600 */

        /* --- Slim, modern pill sizing --- */
        .mw-enter--slim {
          padding: 0.56rem 1.95rem !important;
          font-size: 0.95rem !important;
          line-height: 1.2 !important;
          letter-spacing: 0.01em;
        }

        /* --- Base LED ring look (transparent base; inner+outer glow) --- */
        .mw-enter {
          background: transparent !important;            /* never solid */
          border: 1px solid var(--mw-ring) !important;
          box-shadow:
            inset 0 0 8px 1.5px rgba(22,163,74,0.36),
            0 0 10px 2.5px rgba(22,163,74,0.34);
          transition: box-shadow .18s ease, transform .12s ease, border-color .18s ease;
        }

        /* Hover: stronger glow only (no bg fill; NO text-color change) */
        .mw-enter:hover {
          background: transparent !important;
          transform: translateY(-0.5px);
          box-shadow:
            inset 0 0 12px 2.5px rgba(22,163,74,0.58),
            0 0 16px 5px rgba(22,163,74,0.60),
            0 0 32px 12px rgba(22,163,74,0.24);
        }

        .mw-enter:focus-visible {
          outline: none !important;
          box-shadow:
            inset 0 0 13px 2.5px rgba(22,163,74,0.58),
            0 0 0 2px rgba(255,255,255,0.6),
            0 0 0 4px var(--mw-ring),
            0 0 20px 5px rgba(22,163,74,0.48);
        }

        /* Card halo goes green when any .mw-enter inside is hovered */
        .mw-led { transition: box-shadow .18s ease, border-color .18s ease; }
        .mw-led:has(.mw-enter:hover){
          border-color: rgba(22,163,74,0.55) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.65),
            0 0 0 1px rgba(22,163,74,0.14),
            0 0 12px rgba(22,163,74,0.12),
            0 0 24px rgba(22,163,74,0.10);
        }
        .dark .mw-led:has(.mw-enter:hover){
          border-color: rgba(22,163,74,0.70) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.65),
            0 0 0 1px rgba(22,163,74,0.22),
            0 0 24px rgba(22,163,74,0.24),
            0 0 60px rgba(22,163,74,0.22);
        }
      `}</style>
    </PageLayout>
  )
}
