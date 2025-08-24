// src/pages/Upload.tsx
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import toast, { Toaster } from 'react-hot-toast'
import axios from '@/api/client'
import { useAuthStore } from '@/store/useAuthStore'
import './upload.vo.css'

const allowedModelExtensions = ['stl', '3mf', 'obj']
const maxPhotoSizeBytes = 25 * 1024 * 1024

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
  const { user } = (useAuthStore as any)?.getState ? useAuthStore() : ({ user: undefined } as any)

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

  // TARGET (internal only; no ID shown to users)
  const [attachModelId, setAttachModelId] = useState<string>('')

  // SEARCH
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounced(searchTerm, 300)
  const [matches, setMatches] = useState<ModelLite[]>([])
  const [searching, setSearching] = useState(false)

  // Friendly display of the chosen model (name only)
  const [selectedModelName, setSelectedModelName] = useState<string>('')

  // PRINT CONTEXT (optional metadata)
  const [printedByMe, setPrintedByMe] = useState(false)
  const [orders, setOrders] = useState<PrintOrder[]>([])
  const [selectedPrintId, setSelectedPrintId] = useState<string>('')

  // PHOTOS — three independent slots (null = empty)
  const [slotFiles, setSlotFiles] = useState<Array<File | null>>([null, null, null])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosProgress, setPhotosProgress] = useState(0)
  const [photosOpen, setPhotosOpen] = useState(false)

  const slotInputs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]

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

  // DROPZONE — MODEL
  const onDropModel = useCallback((accepted: File[], fileRejections: any[]) => {
    setModelRejected([]); setModelProgress(0)
    if (!accepted.length) {
      toast.error('❌ No valid model selected.')
      const names = fileRejections.map((rej: any) => rej.file?.name || 'unknown')
      setModelRejected(names); return
    }
    const file = accepted[0]
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!allowedModelExtensions.includes(ext || '')) {
      toast.error(`❌ Invalid file: ${file.name}. Allowed: ${allowedModelExtensions.join(', ')}`)
      setModelRejected([file.name]); return
    }
    setModelFile(file)
  }, [])

  const { getRootProps: getModelRootProps, getInputProps: getModelInputProps, isDragActive: isModelDrag } = useDropzone({
    onDrop: onDropModel, multiple: false, disabled: modelLoading,
    accept: { 'model/stl': ['.stl'], 'application/octet-stream': ['.3mf', '.obj'] },
  })

  // PRINT HISTORY (optional)
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

  // Resolve friendly name whenever our internal target changes
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
      toast.error('❌ Missing user id (X-User-Id). Sign in again.')
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
    if (!modelFile) { toast.error('❌ No model file selected.'); return }
    if (!name.trim()) { toast.error('❌ Name is required.'); return }
    setModelLoading(true)
    try {
      const res = await uploadModelWithProgress(modelFile)
      const modelId = (res?.data?.model?.id || res?.data?.id) as string | undefined
      const modelNameFromRes = res?.data?.model?.name ?? res?.data?.name ?? name
      toast.success(`✅ Model uploaded${modelNameFromRes ? `: ${modelNameFromRes}` : ''}.`)
      if (modelId) {
        setLastModelId(modelId)
        setAttachModelId(modelId)
        setSelectedModelName(modelNameFromRes || '')
        try { localStorage.setItem('last_model_id', modelId) } catch {}
        setPhotosOpen(true)
      }
      setModelFile(null); setModelProgress(0)
      setName(''); setDescription(''); setTags(''); setCredit('')
    } catch (err: any) {
      const code = err?.response?.status
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error'
      toast.error(`❌ Upload failed${code ? ` (${code})` : ''}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
      console.error('[Upload] model error:', err)
    } finally { setModelLoading(false) }
  }

  // ACTIONS — PHOTOS
  const onPickSlot = (i: number) => slotInputs[i].current?.click()

  const onSlotFileChange = (i: number, fileList: FileList | null) => {
    if (!fileList || !fileList[0]) return
    const f = fileList[0]
    if (!f.type.startsWith('image/')) { toast.error('🚫 Not an image.'); return }
    if (f.size > maxPhotoSizeBytes) { toast.error('🚫 File too large (max 25MB).'); return }
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

  const handleSubmitAllPhotos = async () => {
    const internalId = attachModelId || lastModelId || ''
    if (!internalId) { toast.error('❌ Choose or upload a model first.'); return }
    const files = slotFiles.filter(Boolean) as File[]
    if (files.length === 0) { toast.error('❌ Choose at least one image.'); return }
    const exists = await verifyModelExists(internalId)
    if (!exists) { toast.error('❌ That model is no longer available.'); return }

    const userId = resolveUserId()
    if (!userId) { toast.error('❌ Missing user id (X-User-Id). Sign in again.'); return }

    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    form.append('as_print_photo', 'true')
    if (printedByMe && selectedPrintId) form.append('print_id', selectedPrintId)

    setPhotosLoading(true); setPhotosProgress(0)
    try {
      await axios.post(`/upload/models/${internalId}/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data', 'X-User-Id': userId },
        onUploadProgress: (e: ProgressEvent) => { if (e.total) setPhotosProgress(Math.round((e.loaded / e.total) * 100)) },
        validateStatus: (s) => s >= 200 && s < 300,
      })
      toast.success(printedByMe ? '📸 Added your print photos.' : '📸 Photos submitted (may require approval).')
      clearAllSlots()
    } catch (err: any) {
      const code = err?.response?.status
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error'
      toast.error(`❌ Photo upload failed${code ? ` (${code})` : ''}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
      console.error('[Upload] photos error:', err)
    } finally { setPhotosLoading(false); setPhotosProgress(0) }
  }

  // UI
  return (
    <div className="vo-root">
      <Toaster position="top-right" />
      <div className="vo-window" role="dialog" aria-labelledby="voTitle">
        <header className="vo-header">
          <h2 id="voTitle" className="vo-title"><span className="vo-title-emoji">⬆️</span> Upload</h2>
        </header>

        <main className="vo-body">
          <section className="vo-pane" aria-label="Upload content">
            {/* STEP 1 — MODEL */}
            <div className="vo-row">
              <div className="vo-col">
                <h3 className="vo-h3">Model</h3>
                <p className="vo-muted">Drop an STL/3MF/OBJ or click to browse.</p>

                <div {...getModelRootProps()} className={`vo-drop ${isModelDrag ? 'is-drag' : ''}`} aria-busy={modelLoading}>
                  <input {...getModelInputProps()} />
                  <div className="vo-drop-inner">
                    <div className="vo-drop-icon">📦</div>
                    <div>
                      <div className="vo-drop-title">{isModelDrag ? 'Release to upload' : 'Drag & drop here'}</div>
                      <div className="vo-drop-sub">Accepted: .stl, .3mf, .obj</div>
                    </div>
                  </div>
                </div>

                {modelFile && (
                  <div className="vo-file">
                    <div className="vo-file-meta">
                      <div className="vo-file-name">{modelFile.name}</div>
                      <div className="vo-file-size">{(modelFile.size / 1024).toFixed(1)} KB</div>
                    </div>

                    <button
                      className="mw-btn mw-btn-xs mw-btn--red"
                      onClick={() => setModelFile(null)}
                      disabled={modelLoading}
                      aria-label="Remove file"
                    >
                      Remove file
                    </button>

                    {modelLoading && (
                      <div className="vo-progress">
                        <div className="vo-progress-bar" style={{ width: `${modelProgress}%` }} />
                      </div>
                    )}
                  </div>
                )}

                <div className="vo-grid">
                  <label className="vo-field">
                    <span>Name *</span>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Model name" />
                  </label>
                  <label className="vo-field">
                    <span>Tags</span>
                    <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="benchy, calibration" />
                  </label>
                </div>

                <label className="vo-field">
                  <span>Description</span>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the model" rows={4} />
                </label>

                <label className="vo-field">
                  <span>Credit</span>
                  <input type="text" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Original creator’s name" />
                </label>

                {modelRejected.length > 0 && (
                  <div className="vo-error">
                    <strong>Rejected:</strong> {modelRejected.join(', ')}
                  </div>
                )}

                <div className="vo-actions vo-primary">
                  <button
                    className="mw-btn mw-btn-lg"
                    onClick={handleUploadModel}
                    disabled={modelLoading || !modelFile || !name.trim()}
                  >
                    {modelLoading ? `Uploading… ${modelProgress}%` : 'Upload Model'}
                  </button>
                </div>
              </div>

              {/* STEP 2 — CHOOSE WHERE PHOTOS GO (public-friendly; no IDs) */}
              <div className="vo-col">
                <h3 className="vo-h3">Attach Photos To</h3>

                <label className="vo-field">
                  <span>Search by name</span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Start typing a model name…"
                  />
                </label>

                {!searching && matches.length > 0 && (
                  <div className="vo-search">
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        className="vo-search-item"
                        onClick={() => { setAttachModelId(m.id); setSelectedModelName(m.name); setPhotosOpen(true); toast.success(`Selected: ${m.name}`) }}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
                {searching && <div className="vo-muted" style={{ marginTop: 6 }}>Searching…</div>}

                {/* Selected model (name only) */}
                <div className="vo-muted" style={{ marginTop: 10 }}>
                  Selected model: <strong>{selectedModelName || '—'}</strong>
                </div>

                {/* Checkbox + "Use last uploaded" */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                  <label className="vo-check" style={{ margin: 0 }}>
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
                        setPhotosOpen(true)
                      }
                    }}
                    disabled={!lastModelId}
                    title={lastModelId ? 'Use your last uploaded model' : 'No previous uploads yet'}
                  >
                    Use last uploaded
                  </button>
                </div>

                {printedByMe && (
                  <label className="vo-field" style={{ marginTop: 8 }}>
                    <span>Recent prints (optional)</span>
                    <select
                      value={selectedPrintId}
                      onChange={(e) => {
                        const id = e.target.value
                        setSelectedPrintId(id)
                        const order = orders.find((o) => o.id === id)
                        const mId = order?.modelId || order?.model_id
                        const mName = order?.modelName || order?.model_name
                        if (mId) { setAttachModelId(mId); if (mName) setSelectedModelName(mName); setPhotosOpen(true) }
                      }}
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
              </div>
            </div>

            {/* STEP 3 — PHOTOS */}
            {(attachModelId || lastModelId) && (
              <>
                <div className="vo-divider" />

                <details className="vo-photos" open={photosOpen} onToggle={(e) => setPhotosOpen((e.target as HTMLDetailsElement).open)}>
                  <summary className="vo-photos-summary">
                    <span>Photos (up to 3)</span>
                    <span className="vo-muted">{slotFiles.filter(Boolean).length}/3 selected</span>
                  </summary>

                  <div className="vo-slots">
                    {[0,1,2].map((i) => {
                      const f = slotFiles[i]
                      const url = f ? URL.createObjectURL(f) : null
                      return (
                        <div key={i} className={`vo-slot ${f ? 'has-image' : ''}`} onClick={() => onPickSlot(i)} role="button" tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPickSlot(i) }}
                          title={f ? 'Click to replace' : 'Click to upload'}>
                          {f ? (
                            <>
                              <img src={url!} alt={`Selected image ${i+1}`} onLoad={() => url && URL.revokeObjectURL(url)} />
                              <button
                                type="button"
                                className="mw-btn mw-btn-xs mw-btn--red vo-slot-x"
                                title="Clear"
                                onClick={(e) => { e.stopPropagation(); clearSlot(i) }}
                                aria-label={`Clear image ${i+1}`}
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <div className="vo-slot-inner">
                              <div className="vo-slot-plus">＋</div>
                              <div className="vo-slot-hint">Add photo</div>
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

                  {photosLoading && (
                    <div className="vo-progress" style={{ marginTop: 10 }}>
                      <div className="vo-progress-bar" style={{ width: `${photosProgress}%` }} />
                    </div>
                  )}

                  <div className="vo-actions between" style={{ marginTop: 12 }}>
                    <button
                      className="mw-btn mw-btn-sm mw-btn--quiet"
                      onClick={clearAllSlots}
                      disabled={photosLoading || slotFiles.every(s => !s)}
                    >
                      Clear all
                    </button>
                    <button
                      className="mw-btn mw-btn-lg"
                      onClick={handleSubmitAllPhotos}
                      disabled={photosLoading || slotFiles.every(s => !s)}
                      title="Upload selected photos for the chosen model"
                    >
                      {photosLoading ? `Submitting… ${photosProgress}%` : 'Submit All'}
                    </button>
                  </div>
                </details>
              </>
            )}

            {lastModelId && (
              <div className="vo-muted" style={{ marginTop: 8 }}>
                Last uploaded model saved to your session.
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

export default UploadPage
