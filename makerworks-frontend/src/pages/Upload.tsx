// src/pages/Upload.tsx
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import axios from '@/api/client'
import { useAuthStore } from '@/store/useAuthStore'
import { Toaster, toast } from 'sonner'
import PageHeader from '@/components/ui/PageHeader'
import { UploadCloud } from 'lucide-react'

// Keep the same file rules
const allowedModelExtensions = ['stl', '3mf', 'obj']
const maxPhotoSizeBytes = 25 * 1024 * 1024

// Theme helpers to match Cart/Checkout
const AMBER_RING = 'border-amber-400/45 ring-1 ring-amber-400/40 hover:ring-amber-400/60 focus-within:ring-amber-400/70'
const INNER_GLOW = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]'

type PrintOrder = {
  id: string
  model_id?: string
  modelId?: string
  model_name?: string
  modelName?: string
}
type ModelLite = { id: string; name: string }

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

const UploadPage: React.FC = () => {
  // Zustand store (safe fallback if something’s odd in dev)
  const storeMaybe = (useAuthStore as any)?.getState ? useAuthStore() : ({ user: undefined } as any)
  const { user } = storeMaybe

  // MODEL
  const [modelLoading, setModelLoading] = useState(false)
  const [modelProgress, setModelProgress] = useState(0)
  const [modelFile, setModelFile] = useState<File | null>(null)
  const [modelRejected, setModelRejected] = useState<string[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [credit, setCredit] = useState('')
  const [lastModelId, setLastModelId] = useState<string | null>(() => {
    try { return localStorage.getItem('last_model_id') || null } catch { return null }
  })

  // TARGET
  const [attachModelId, setAttachModelId] = useState<string>('')

  // SEARCH
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounced(searchTerm, 300)
  const [matches, setMatches] = useState<ModelLite[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedModelName, setSelectedModelName] = useState<string>('')

  // PRINT CONTEXT
  const [printedByMe, setPrintedByMe] = useState(false)
  const [orders, setOrders] = useState<PrintOrder[]>([])
  const [selectedPrintId, setSelectedPrintId] = useState<string>('')

  // PHOTOS (3 slots)
  const [slotFiles, setSlotFiles] = useState<Array<File | null>>([null, null, null])
  const slotInputs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]

  // util
  const resolveUserId = (): string | undefined => {
    const idFromStore = (user as any)?.id
    if (idFromStore) return idFromStore
    try {
      const lsUser = localStorage.getItem('user') || localStorage.getItem('profile')
      if (lsUser) {
        const parsed = JSON.parse(lsUser)
        if (parsed?.id) return parsed.id
      }
      const direct = localStorage.getItem('user_id')
      if (direct) return direct
    } catch {}
    return undefined
  }

  // DROPZONE — MODEL (accept by extension for reliability across browsers)
  const onDropModel = useCallback((accepted: File[], fileRejections: any[]) => {
    setModelRejected([]); setModelProgress(0)
    if (!accepted.length) {
      toast.error('No valid model selected.')
      const names = fileRejections.map((rej: any) => rej.file?.name || 'unknown')
      setModelRejected(names); return
    }
    const file = accepted[0]
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!allowedModelExtensions.includes(ext || '')) {
      toast.error(`Invalid file: ${file.name}. Allowed: ${allowedModelExtensions.join(', ')}`)
      setModelRejected([file.name]); return
    }
    setModelFile(file)
  }, [])

  const { getRootProps: getModelRootProps, getInputProps: getModelInputProps, isDragActive: isModelDrag } = useDropzone({
    onDrop: onDropModel,
    multiple: false,
    disabled: modelLoading,
    // map to extensions; MIME detection for .3mf/.obj is inconsistent across OSes/browsers
    accept: { 'application/*': ['.stl', '.3mf', '.obj'], 'model/*': ['.stl'] },
  })

  // PRINT HISTORY
  useEffect(() => {
    if (!printedByMe) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await axios.get('/checkout/history', { withCredentials: true })
        const rows: any[] = Array.isArray(res.data) ? res.data : res.data?.items || []
        const mapped: PrintOrder[] = rows.map((r) => ({
          id: String(r.id ?? r.order_id ?? crypto.randomUUID()),
          model_id: r.model_id ?? r.modelId,
          modelId: r.model_id ?? r.modelId,
          model_name: r.model_name ?? r.modelName,
          modelName: r.model_name ?? r.modelName,
        }))
        if (!cancelled) setOrders(mapped)
      } catch {
        if (!cancelled) setOrders([])
      }
    })()
    return () => { cancelled = true }
  }, [printedByMe])

  // SEARCH (by name)
  useEffect(() => {
    const q = debouncedSearch.trim()
    if (!q) { setMatches([]); return }
    let cancelled = false
    setSearching(true)
    ;(async () => {
      try {
        const res = await axios.get('/models', { params: { q }, withCredentials: true })
        const list: any[] = Array.isArray(res.data) ? res.data : res.data?.items || []
        const slim: ModelLite[] = list.slice(0, 8).map((m) => ({
          id: String(m.id ?? m.model_id ?? ''),
          name: String(m.name ?? m.title ?? 'Model'),
        })).filter(m => m.id)
        if (!cancelled) setMatches(slim)
      } catch {
        if (!cancelled) setMatches([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    })()
    return () => { cancelled = true }
  }, [debouncedSearch])

  // Selected model name
  useEffect(() => {
    const internalId = attachModelId || lastModelId || ''
    if (!internalId) { setSelectedModelName(''); return }
    let cancelled = false
    ;(async () => {
      try {
        const r = await axios.get(`/models/${internalId}`, { withCredentials: true })
        const n = r?.data?.name ?? r?.data?.title ?? ''
        if (!cancelled) setSelectedModelName(n)
      } catch {
        if (!cancelled) setSelectedModelName('')
      }
    })()
    return () => { cancelled = true }
  }, [attachModelId, lastModelId])

  // ACTIONS — MODEL
  const uploadModelWithProgress = async (file: File) => {
    const userId = resolveUserId()
    if (!userId) {
      toast.error('Missing user id (X-User-Id). Sign in again.')
      throw new Error('Missing user id')
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name)
    formData.append('description', description)
    formData.append('tags', tags)
    formData.append('credit', credit)

    return axios.post(`/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data', 'X-User-Id': userId },
      onUploadProgress: (e: ProgressEvent) => { if (e.total) setModelProgress(Math.round((e.loaded / e.total) * 100)) },
      validateStatus: (s) => s >= 200 && s < 300,
    })
  }

  const handleUploadModel = async () => {
    if (!modelFile) { toast.error('No model file selected.'); return }
    if (!name.trim()) { toast.error('Name is required.'); return }
    setModelLoading(true)
    try {
      const res = await uploadModelWithProgress(modelFile)
      const modelId = (res?.data?.model?.id || res?.data?.id) as string | undefined
      const modelNameFromRes = res?.data?.model?.name ?? res?.data?.name ?? name
      toast.success(modelNameFromRes ? `Model uploaded: ${modelNameFromRes}` : 'Model uploaded.')
      if (modelId) {
        setLastModelId(modelId)
        setAttachModelId(modelId)
        setSelectedModelName(modelNameFromRes || '')
        try { localStorage.setItem('last_model_id', modelId) } catch {}
      }
      setModelFile(null); setModelProgress(0)
      setName(''); setDescription(''); setTags(''); setCredit('')
    } catch (err: any) {
      const code = err?.response?.status
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error'
      toast.error(`Upload failed${code ? ` (${code})` : ''}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
      console.error('[Upload] model error:', err)
    } finally { setModelLoading(false) }
  }

  // ACTIONS — PHOTOS
  const onPickSlot = (i: number) => slotInputs[i].current?.click()

  const onSlotFileChange = (i: number, fileList: FileList | null) => {
    if (!fileList || !fileList[0]) return
    const f = fileList[0]
    if (!f.type.startsWith('image/')) { toast.error('Not an image.'); return }
    if (f.size > maxPhotoSizeBytes) { toast.error('File too large (max 25MB).'); return }
    setSlotFiles((prev) => { const next = [...prev]; next[i] = f; return next })
  }

  const clearSlot = (i: number) => {
    setSlotFiles((prev) => { const next = [...prev]; next[i] = null; return next })
    if (slotInputs[i].current) slotInputs[i].current!.value = ''
  }

  const clearAllSlots = () => {
    setSlotFiles([null, null, null])
    slotInputs.forEach(ref => { if (ref.current) ref.current.value = '' })
  }

  const verifyModelExists = async (internalId: string) => {
    try { const r = await axios.get(`/models/${internalId}`, { withCredentials: true }); return r?.status >= 200 && r?.status < 300 }
    catch { return false }
  }

  const photosSelectedCount = useMemo(() => slotFiles.filter(Boolean).length, [slotFiles])

  const handleSubmitAllPhotos = async () => {
    const internalId = attachModelId || lastModelId || ''
    if (!internalId) { toast.error('Choose or upload a model first.'); return }
    const files = slotFiles.filter(Boolean) as File[]
    if (files.length === 0) { toast.error('Choose at least one image.'); return }
    const exists = await verifyModelExists(internalId)
    if (!exists) { toast.error('That model is no longer available.'); return }

    const userId = resolveUserId()
    if (!userId) { toast.error('Missing user id (X-User-Id). Sign in again.'); return }

    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('as_print_photo', 'true')
    if (printedByMe && selectedPrintId) form.append('print_id', selectedPrintId)

    try {
      await axios.post(`/upload/models/${internalId}/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data', 'X-User-Id': userId },
        validateStatus: (s) => s >= 200 && s < 300,
      })
      toast.success(printedByMe ? 'Added your print photos.' : 'Photos submitted (may require approval).')
      clearAllSlots()
    } catch (err: any) {
      const code = err?.response?.status
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error'
      toast.error(`Photo upload failed${code ? ` (${code})` : ''}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
      console.error('[Upload] photos error:', err)
    }
  }

  // UI
  return (
    <div>
      <Toaster position="top-right" richColors />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <PageHeader icon={<UploadCloud className="w-8 h-8 text-zinc-400" />} title="Upload" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT — MODEL */}
          <section className={['rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur-xl p-6', AMBER_RING, INNER_GLOW].join(' ')}>
            <h3 className="text-lg font-medium mb-2">Model</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">Drop an STL/3MF/OBJ or click to browse.</p>

            <div
              {...getModelRootProps()}
              className={[
                'group grid place-items-center aspect-[16/9] rounded-xl border border-dashed',
                'bg-white/60 dark:bg-white/5 cursor-pointer',
                AMBER_RING,
              ].join(' ')}
              aria-busy={modelLoading}
            >
              <input {...getModelInputProps()} />
              <div className="flex items-center gap-3">
                <span className="text-2xl">📦</span>
                <div>
                  <div className="font-medium">
                    {isModelDrag ? 'Release to upload' : 'Drag & drop here'}
                  </div>
                  <div className="text-xs opacity-70">Accepted: .stl, .3mf, .obj</div>
                </div>
              </div>
            </div>

            {modelFile && (
              <div className="mt-4 rounded-xl p-3 bg-white/60 dark:bg-white/10 border border-white/20">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{modelFile.name}</div>
                    <div className="text-xs opacity-70">{(modelFile.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <button
                    className="mw-btn mw-btn-xs mw-btn--red"
                    onClick={() => setModelFile(null)}
                    disabled={modelLoading}
                    aria-label="Remove file"
                  >
                    Remove file
                  </button>
                </div>

                {modelLoading && (
                  <div className="mt-3 h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-[width] duration-200"
                      style={{ width: `${modelProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-sm mb-1">Name *</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Model name"
                  className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                />
              </label>
              <label className="block">
                <span className="block text-sm mb-1">Tags</span>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="benchy, calibration"
                  className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                />
              </label>
            </div>

            <label className="block mt-4">
              <span className="block text-sm mb-1">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the model"
                rows={4}
                className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
              />
            </label>

            <label className="block mt-4">
              <span className="block text-sm mb-1">Credit</span>
              <input
                type="text"
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                placeholder="Original creator’s name"
                className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
              />
            </label>

            {modelRejected.length > 0 && (
              <div className="mt-3 text-sm text-red-600">
                <strong>Rejected:</strong> {modelRejected.join(', ')}
              </div>
            )}

            <div className="mt-5">
              <button
                className="mw-btn mw-btn-lg"
                onClick={handleUploadModel}
                disabled={modelLoading || !modelFile || !name.trim()}
              >
                {modelLoading ? `Uploading… ${modelProgress}%` : 'Upload Model'}
              </button>
            </div>
          </section>

          {/* RIGHT — ATTACH + PHOTOS */}
          <section className={['rounded-2xl bg-white/70 dark:bg-white/10 backdrop-blur-xl p-6', AMBER_RING, INNER_GLOW].join(' ')}>
            <h3 className="text-lg font-medium mb-4">Attach Photos To</h3>

            <label className="block">
              <span className="block text-sm mb-1">Search by name</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Start typing a model name…"
                className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
              />
            </label>

            {!searching && matches.length > 0 && (
              <div className="mt-2 rounded-xl border border-white/20 overflow-hidden">
                {matches.map((m, idx) => (
                  <button
                    key={m.id}
                    className={[
                      'w-full text-left px-3 py-2 text-sm',
                      idx % 2 ? 'bg-white/40 dark:bg-white/5' : 'bg-white/60 dark:bg-white/10',
                      'hover:bg-amber-50/70 dark:hover:bg-amber-500/10',
                    ].join(' ')}
                    onClick={() => { setAttachModelId(m.id); setSelectedModelName(m.name); toast.success(`Selected: ${m.name}`) }}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
            {searching && <div className="mt-2 text-sm text-zinc-500">Searching…</div>}

            <div className="mt-4">
              <label className="block">
                <span className="block text-sm mb-1">Selected model</span>
                <div className="rounded-lg px-3 py-2 bg-white/60 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10" aria-live="polite">
                  {selectedModelName || '—'}
                </div>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={printedByMe} onChange={(e) => setPrintedByMe(e.target.checked)} />
                <span>I printed this</span>
              </label>

              <button
                type="button"
                className="mw-btn mw-btn-xs mw-btn--quiet"
                onClick={() => {
                  if (lastModelId) {
                    setAttachModelId(lastModelId)
                    toast.success('Using your last uploaded model')
                  }
                }}
                disabled={!lastModelId}
                title={lastModelId ? 'Use your last uploaded model' : 'No previous uploads yet'}
              >
                Use last uploaded
              </button>
            </div>

            {printedByMe && (
              <label className="block mt-3">
                <span className="block text-sm mb-1">Recent prints (optional)</span>
                <select
                  value={selectedPrintId}
                  onChange={(e) => {
                    const id = e.target.value
                    setSelectedPrintId(id)
                    const order = orders.find((o) => o.id === id)
                    const mId = order?.modelId || order?.model_id
                    const mName = order?.modelName || order?.model_name
                    if (mId) { setAttachModelId(mId); if (mName) setSelectedModelName(mName) }
                  }}
                  className="w-full rounded-lg px-3 py-2 bg-white/80 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10"
                >
                  <option value="">— None —</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.modelName || o.model_name || 'Model'}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* PHOTOS */}
            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">Photos (up to 3)</span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{photosSelectedCount}/3 selected</span>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-3">
                {[0,1,2].map((i) => {
                  const f = slotFiles[i]
                  const url = f ? URL.createObjectURL(f) : null
                  return (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => onPickSlot(i)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPickSlot(i) }}
                      className={[
                        'relative aspect-square rounded-xl overflow-hidden',
                        'bg-white/60 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/10',
                        'grid place-items-center',
                      ].join(' ')}
                      title={f ? 'Click to replace' : 'Click to upload'}
                    >
                      {f ? (
                        <>
                          <img
                            src={url!}
                            alt={`Selected image ${i+1}`}
                            className="w-full h-full object-cover"
                            onLoad={() => url && URL.revokeObjectURL(url)}
                          />
                          <button
                            type="button"
                            className="mw-btn mw-btn-xs mw-btn--red absolute top-2 right-2"
                            title="Clear"
                            onClick={(e) => { e.stopPropagation(); clearSlot(i) }}
                            aria-label={`Clear image ${i+1}`}
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <div className="text-center">
                          <div className="text-2xl leading-none">＋</div>
                          <div className="text-[11px] opacity-70">Add photo</div>
                        </div>
                      )}
                      <input
                        ref={slotInputs[i]}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => onSlotFileChange(i, e.target.files)}
                      />
                    </div>
                  )
                })}
              </div>

              <div className="mt-4">
                <button
                  className="mw-btn mw-btn-lg"
                  onClick={handleSubmitAllPhotos}
                  disabled={slotFiles.every(s => !s)}
                  title="Upload selected photos for the chosen model"
                >
                  Submit All
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* tiny hint */}
        {lastModelId && (
          <div className="mt-4 text-xs text-zinc-500">Last uploaded model saved to your session.</div>
        )}
      </main>
    </div>
  )
}

export default UploadPage
