// src/pages/Upload.tsx
// Single-card VisionOS-style upload with LED green ring/glow accents
// - No tabs: model + photos in one elegant pane
// - Per-photo remove + Clear All
// - Remove selected model file

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import toast, { Toaster } from 'react-hot-toast'
import axios from '@/api/client'
import { useAuthStore } from '@/store/useAuthStore'
const allowedModelExtensions = ['stl', '3mf', 'obj']

type PrintOrder = {
  id: string
  model_id?: string
  modelId?: string
  model_name?: string
  modelName?: string
}

type ModelLite = {
  id: string
  name: string
}

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

const UploadPage: React.FC = () => {
  const { user } =
    (useAuthStore as any)?.getState ? useAuthStore() : ({ user: undefined } as any)

  // ---------- MODEL ----------
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

  // ---------- PHOTOS ----------
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosProgress, setPhotosProgress] = useState(0)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoRejected, setPhotoRejected] = useState<string[]>([])

  const [attachModelId, setAttachModelId] = useState<string>('')
  const effectiveModelId = useMemo(
    () => (attachModelId?.trim() ? attachModelId.trim() : lastModelId || ''),
    [attachModelId, lastModelId]
  )

  const [printedByMe, setPrintedByMe] = useState(false)
  const [orders, setOrders] = useState<PrintOrder[]>([])
  const [selectedPrintId, setSelectedPrintId] = useState<string>('')

  // model search
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounced(searchTerm, 300)
  const [matches, setMatches] = useState<ModelLite[]>([])
  const [searching, setSearching] = useState(false)

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

  // ---------- DROPZONES ----------
  const onDropModel = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setModelRejected([])
    setModelProgress(0)

    if (!acceptedFiles.length) {
      toast.error('❌ No valid model selected.')
      const names = fileRejections.map((rej: any) => rej.file?.name || 'unknown')
      setModelRejected(names)
      return
    }

    const file = acceptedFiles[0]
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!allowedModelExtensions.includes(ext || '')) {
      toast.error(`❌ Invalid file: ${file.name}. Allowed: ${allowedModelExtensions.join(', ')}`)
      setModelRejected([file.name])
      return
    }
    setModelFile(file)
  }, [])

  const { getRootProps: getModelRootProps, getInputProps: getModelInputProps, isDragActive: isModelDrag } = useDropzone({
    onDrop: onDropModel,
    multiple: false,
    disabled: modelLoading,
    accept: {
      'model/stl': ['.stl'],
      'application/octet-stream': ['.3mf', '.obj'],
    },
  })

  const onDropPhotos = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setPhotoRejected([])
    setPhotosProgress(0)

    const combined = [...photoFiles, ...acceptedFiles].slice(0, 3)
    const rejectedNames: string[] = []

    const filtered = combined.filter((f) => {
      const okType = f.type.startsWith('image/')
      const okSize = f.size <= 25 * 1024 * 1024
      if (!okType || !okSize) rejectedNames.push(f.name)
      return okType && okSize
    })

    if (rejectedNames.length) toast.error(`🚫 Rejected: ${rejectedNames.join(', ')}`)
    if (!filtered.length) {
      setPhotoRejected(rejectedNames.length ? rejectedNames : fileRejections.map((r: any) => r.file?.name || 'unknown'))
      return
    }
    setPhotoFiles(filtered.slice(0, 3))
  }, [photoFiles])

  const { getRootProps: getPhotosRootProps, getInputProps: getPhotosInputProps, isDragActive: isPhotosDrag } = useDropzone({
    onDrop: onDropPhotos,
    multiple: true,
    disabled: photosLoading,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 3,
  })

  // ---------- DATA ----------
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

  // ---------- ACTIONS ----------
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
      headers: {
        'Content-Type': 'multipart/form-data',
        'X-User-Id': userId,
      },
      onUploadProgress: (e: ProgressEvent) => {
        if (e.total) setModelProgress(Math.round((e.loaded / e.total) * 100))
      },
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
      toast.success(`✅ Model uploaded${modelId ? ` (${modelId.slice(0, 8)}…)` : ''}.`)

      if (modelId) {
        setLastModelId(modelId)
        try { localStorage.setItem('last_model_id', modelId) } catch {}
        if (!attachModelId.trim()) setAttachModelId(modelId)
      }

      setModelFile(null)
      setModelProgress(0)
      setName(''); setDescription(''); setTags(''); setCredit('')
    } catch (err: any) {
      const code = err?.response?.status
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error'
      toast.error(`❌ Upload failed${code ? ` (${code})` : ''}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
      console.error('[Upload] model error:', err)
    } finally {
      setModelLoading(false)
    }
  }

  const verifyModelId = async (id: string) => {
    try {
      const r = await axios.get(`/models/${id}`, { withCredentials: true })
      return r?.status >= 200 && r?.status < 300
    } catch {
      return false
    }
  }

  const handleUploadPhotos = async () => {
    if (!effectiveModelId) {
      toast.error('❌ Provide a Model ID (or upload a model first).')
      return
    }
    if (!photoFiles.length) {
      toast.error('❌ Choose up to 3 images.')
      return
    }
    const exists = await verifyModelId(effectiveModelId)
    if (!exists) {
      toast.error('❌ That Model ID does not exist.')
      return
    }

    const userId = resolveUserId()
    if (!userId) {
      toast.error('❌ Missing user id (X-User-Id). Sign in again.')
      return
    }

    const form = new FormData()
    photoFiles.forEach((f) => form.append('files', f))
    form.append('as_print_photo', 'true')
    if (printedByMe && selectedPrintId) form.append('print_id', selectedPrintId)

    setPhotosLoading(true)
    setPhotosProgress(0)
    try {
      await axios.post(`/models/${effectiveModelId}/photos`, form, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-User-Id': userId,
        },
        onUploadProgress: (e: ProgressEvent) => {
          if (e.total) setPhotosProgress(Math.round((e.loaded / e.total) * 100))
        },
        validateStatus: (s) => s >= 200 && s < 300,
      })
      toast.success(printedByMe ? '📸 Added your print photos.' : '📸 Photos submitted (may require approval).')
      setPhotoFiles([])
      setPhotosProgress(0)
    } catch (err: any) {
      const code = err?.response?.status
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error'
      toast.error(`❌ Photo upload failed${code ? ` (${code})` : ''}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
      console.error('[Upload] photos error:', err)
    } finally {
      setPhotosLoading(false)
    }
  }

  // ---------- HELPERS (remove/clear) ----------
  const removeModelSelection = () => setModelFile(null)
  const removePhotoAt = (idx: number) =>
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx))
  const clearAllPhotos = () => setPhotoFiles([])

  // ---------- UI ----------
  return (
    <div className="vo-root">
      <Toaster position="top-right" />
      <div className="vo-window" role="dialog" aria-labelledby="voTitle">
        <header className="vo-header">
          <h2 id="voTitle" className="vo-title">
            <span className="vo-title-emoji">⬆️</span>
            Upload
          </h2>
        </header>

        <main className="vo-body">
          <section className="vo-pane" aria-label="Upload content">
            {/* SECTION: MODEL */}
            <h3 className="vo-h3">Model</h3>
            <p className="vo-muted">Drop an STL/3MF/OBJ or click to browse.</p>

            <div
              {...getModelRootProps()}
              className={`vo-drop ${isModelDrag ? 'is-drag' : ''}`}
              aria-busy={modelLoading}
            >
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
                <button className="vo-chip danger" onClick={removeModelSelection} disabled={modelLoading}>
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
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Model name"
                />
              </label>
              <label className="vo-field">
                <span>Tags</span>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="benchy, calibration"
                />
              </label>
            </div>

            <label className="vo-field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the model"
                rows={4}
              />
            </label>

            <label className="vo-field">
              <span>Credit</span>
              <input
                type="text"
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                placeholder="Original creator’s name"
              />
            </label>

            {modelRejected.length > 0 && (
              <div className="vo-error">
                <strong>Rejected:</strong> {modelRejected.join(', ')}
              </div>
            )}

            <div className="vo-actions">
              <button className="vo-cta" onClick={handleUploadModel} disabled={modelLoading || !modelFile || !name.trim()}>
                {modelLoading ? `Uploading… ${modelProgress}%` : 'Upload Model'}
              </button>
            </div>

            <div className="vo-divider" />

            {/* SECTION: ATTACH TARGET */}
            <h3 className="vo-h3">Attach Photos To</h3>
            <div className="vo-grid">
              <label className="vo-field">
                <span>Attach to Model ID</span>
                <input
                  type="text"
                  value={attachModelId}
                  onChange={(e) => setAttachModelId(e.target.value)}
                  placeholder={lastModelId ? `Using: ${lastModelId}` : 'Paste a model id…'}
                />
              </label>
              <label className="vo-field">
                <span>Effective Model ID</span>
                <input type="text" value={effectiveModelId} readOnly />
              </label>
            </div>

            <label className="vo-field">
              <span>…or search by name</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Start typing a model name…"
              />
            </label>

            {searching && <div className="vo-muted" style={{ marginTop: 6 }}>Searching…</div>}
            {!searching && matches.length > 0 && (
              <div className="vo-search">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    className="vo-search-item"
                    onClick={() => { setAttachModelId(m.id); toast.success(`Selected: ${m.name}`) }}
                  >
                    {m.name} <span className="vo-id">· {m.id.slice(0, 8)}</span>
                  </button>
                ))}
              </div>
            )}

            <label className="vo-check" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={printedByMe}
                onChange={(e) => setPrintedByMe(e.target.checked)}
              />
              <span>I printed this</span>
            </label>

            {printedByMe && (
              <label className="vo-field">
                <span>Recent prints (optional)</span>
                <select
                  value={selectedPrintId}
                  onChange={(e) => {
                    const id = e.target.value
                    setSelectedPrintId(id)
                    const order = orders.find((o) => o.id === id)
                    const mId = order?.modelId || order?.model_id
                    if (mId) setAttachModelId(mId)
                  }}
                >
                  <option value="">— None —</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      #{o.id.slice(0, 8)} · {o.modelName || o.model_name || 'Model'}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="vo-divider" />

            {/* SECTION: PHOTOS */}
            <h3 className="vo-h3">Photos</h3>
            <p className="vo-muted">Add up to 3 images. Community photos may require approval.</p>

            <div
              {...getPhotosRootProps()}
              className={`vo-drop ${isPhotosDrag ? 'is-drag' : ''}`}
              aria-busy={photosLoading}
            >
              <input {...getPhotosInputProps()} />
              <div className="vo-drop-inner">
                <div className="vo-drop-icon">📷</div>
                <div>
                  <div className="vo-drop-title">{isPhotosDrag ? 'Release to add' : 'Drop images or click'}</div>
                  <div className="vo-drop-sub">.png · .jpg · .jpeg · .webp (≤ 25MB) — up to 3</div>
                </div>
              </div>
            </div>

            <div className="vo-thumbs">
              {photosLoading ? (
                Array.from({ length: 3 }).map((_, i) => <div key={i} className="vo-thumb is-skeleton" />)
              ) : photoFiles.length > 0 ? (
                <>
                  {photoFiles.map((file, idx) => {
                    const url = URL.createObjectURL(file)
                    return (
                      <div key={idx} className="vo-thumb">
                        {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                        <img
                          src={url}
                          alt={`Selected image ${idx + 1}`}
                          onLoad={() => URL.revokeObjectURL(url)}
                        />
                        <button
                          type="button"
                          className="vo-x"
                          title="Remove"
                          onClick={() => removePhotoAt(idx)}
                          disabled={photosLoading}
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                  {photoFiles.length < 3 &&
                    Array.from({ length: 3 - photoFiles.length }).map((_, i) => (
                      <div key={`blank-${i}`} className="vo-thumb is-empty" />
                    ))}
                </>
              ) : (
                Array.from({ length: 3 }).map((_, i) => <div key={`empty-${i}`} className="vo-thumb is-empty" />)
              )}
            </div>

            <div className="vo-actions between">
              <button className="vo-chip" onClick={clearAllPhotos} disabled={photosLoading || photoFiles.length === 0}>
                Clear all
              </button>
              <button
                className="vo-cta"
                onClick={handleUploadPhotos}
                disabled={photosLoading || !effectiveModelId}
                title={!effectiveModelId ? 'Upload a model first or paste/select a Model ID' : (printedByMe ? 'Upload as print photos' : 'Upload photos (may need approval)')}
              >
                {photosLoading ? `Uploading photos… ${photosProgress}%` : `Upload ${photoFiles.length || 0}/3 Photos`}
              </button>
            </div>

            {lastModelId && (
              <div className="vo-muted" style={{ marginTop: 8 }}>
                Last uploaded model: <code className="vo-code">{lastModelId}</code>
              </div>
            )}
          </section>
        </main>
      </div>

      <style>{`
        :root{
          /* ===== LED GREEN THEME (replaces orange) ===== */
          --led: #16a34a; /* emerald-600-ish */
          --ring-inner: inset 0 0 6px 1px rgba(22,163,74,.35);
          --ring-outer: 0 0 8px 2px rgba(22,163,74,.32);
          --ring-inner-strong: inset 0 0 12px 2.5px rgba(22,163,74,.58);
          --ring-outer-strong: 0 0 16px 5px rgba(22,163,74,.60), 0 0 32px 12px rgba(22,163,74,.24);

          /* Base surfaces/text (fallbacks if app vars missing) */
          --vo-bg: rgba(255,255,255,0.06);
          --vo-stroke: rgba(255,255,255,0.14);
          --vo-soft: rgba(255,255,255,0.08);
          --vo-text: var(--mw-text-light, #e5e7eb);
          --vo-muted: var(--mw-muted, rgba(229,231,235,0.7));
          --vo-shadow: 0 22px 80px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .vo-root{
          min-height: calc(100dvh - 120px);
          display: grid;
          place-items: start center;
          padding: 32px 20px 56px;
          color: var(--vo-text);
        }
        .vo-window{
          width: min(100%, 980px);
          border-radius: 28px;
          background: radial-gradient(120% 120% at 50% 0%, rgba(255,255,255,.12), rgba(255,255,255,.04)), var(--vo-bg);
          backdrop-filter: blur(24px) saturate(160%);
          border: 1px solid var(--vo-stroke);
          box-shadow: var(--vo-shadow);
          overflow: clip;
          transition: box-shadow .18s ease;
        }
        /* Card aura when any LED button is hovered */
        .vo-window:has(.vo-cta:hover) {
          box-shadow:
            0 0 0 1px rgba(22,163,74,.35),
            0 0 22px 8px rgba(22,163,74,.30),
            0 0 50px 20px rgba(22,163,74,.18),
            var(--vo-shadow);
        }

        .vo-header{
          display:flex; align-items:center; justify-content:space-between;
          padding: 18px 22px;
          border-bottom: 1px solid var(--vo-stroke);
          background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
        }
        .vo-title{
          display:flex; gap:10px; align-items:center;
          font-weight:800; letter-spacing:.2px; margin:0;
          text-shadow: 0 1px 2px rgba(0,0,0,.35);
        }
        .vo-title-emoji{ filter: drop-shadow(0 1px 6px rgba(0,0,0,.25)); }

        .vo-body{ padding: 18px; }
        .vo-pane{
          border-radius: 20px; padding: 18px;
          background: rgba(255,255,255,.04);
          border: 1px solid var(--vo-stroke);
          box-shadow: var(--vo-shadow);
          transition: box-shadow .18s ease;
        }
        .vo-pane:has(.vo-cta:hover){
          box-shadow:
            0 0 0 1px rgba(22,163,74,.35),
            0 0 22px 8px rgba(22,163,74,.30),
            0 0 50px 20px rgba(22,163,74,.18),
            var(--vo-shadow);
        }

        .vo-h3{ margin: 0 0 6px; font-weight: 800; letter-spacing:.2px; }
        .vo-muted{ color: var(--vo-muted); }

        .vo-divider{
          height:1px; background: var(--vo-stroke);
          margin: 18px 0; border-radius: 999px;
        }

        .vo-drop{
          border: 1px dashed rgba(255,255,255,.25);
          background: rgba(255,255,255,.04);
          border-radius: 16px;
          padding: 18px; margin: 10px 0 14px; transition: all .18s ease;
        }
        .vo-drop.is-drag{
          border-color: rgba(22,163,74,.55);
          box-shadow: var(--ring-inner), var(--ring-outer);
          background: rgba(22,163,74,.10);
        }
        .vo-drop-inner{ display:flex; gap:12px; align-items:center; justify-content:center; text-align:center; }
        .vo-drop-icon{ font-size: 28px; filter: drop-shadow(0 1px 6px rgba(0,0,0,.25)); }
        .vo-drop-title{ font-weight:800; }
        .vo-drop-sub{ color: var(--vo-muted); font-size:12px; }

        .vo-file{
          display:grid; grid-template-columns: 1fr auto; gap:8px 12px; align-items:center;
          border:1px solid var(--vo-stroke); border-radius:12px; padding:10px 12px;
          background: rgba(255,255,255,.04); margin-top: 6px;
        }
        .vo-file-meta{ min-width:0 }
        .vo-file-name{ font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .vo-file-size{ color:var(--vo-muted); font-size:12px; }
        .vo-progress{ grid-column:1/-1; height:8px; background:#2f2f2f; border-radius:999px; overflow:hidden; }
        .vo-progress-bar{ height:100%; background: var(--led); box-shadow: var(--ring-outer); }

        .vo-grid{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
        @media (max-width: 720px){ .vo-grid{ grid-template-columns: 1fr; } }

        .vo-field{ display:grid; gap:6px; }
        .vo-field > span{ font-size:12px; color: var(--vo-muted); }
        .vo-field input, .vo-field textarea, .vo-field select{
          border-radius:12px; padding:10px 12px; border:1px solid var(--vo-stroke);
          background: rgba(0,0,0,.25); color: #fff; outline:none;
          transition: box-shadow .18s ease, border-color .18s ease, background .18s ease;
        }
        .vo-field input:focus, .vo-field textarea:focus, .vo-field select:focus{
          border-color: rgba(22,163,74,.45);
          box-shadow: var(--ring-inner), var(--ring-outer);
          background: rgba(22,163,74,.06);
        }

        .vo-check{ display:inline-flex; align-items:center; gap:10px; margin: 6px 0 12px; }

        .vo-search{
          margin-top:6px; border:1px solid var(--vo-stroke); border-radius:12px;
          max-height:180px; overflow:auto; background: rgba(0,0,0,.25);
        }
        .vo-search-item{
          display:block; width:100%; text-align:left; padding:10px 12px;
          background:transparent; border:none; color:#fff; cursor:pointer;
        }
        .vo-search-item:hover{ background: rgba(255,255,255,.06); }
        .vo-id{ color: var(--vo-muted); }

        .vo-thumbs{ display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; min-height:110px; }
        .vo-thumb{
          position: relative;
          aspect-ratio: 4/3; border-radius:12px; overflow:hidden;
          border:1px solid var(--vo-stroke); background: rgba(255,255,255,.04);
        }
        .vo-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
        .vo-thumb.is-skeleton{ animation: pulse 1.2s ease-in-out infinite; background: rgba(255,255,255,.10); }
        .vo-thumb.is-empty{ background: rgba(255,255,255,.06); border-style:dashed; }

        .vo-x{
          position:absolute; top:8px; right:8px;
          border:1px solid rgba(22,163,74,.45);
          background: rgba(0,0,0,.55);
          color:#fff; width:28px; height:28px; border-radius:999px;
          display:grid; place-items:center; font-weight:900;
          box-shadow: var(--ring-outer); cursor:pointer;
        }
        .vo-x:hover{ background: rgba(22,163,74,.22); }

        .vo-chip{
          border:1px solid var(--vo-stroke);
          background: rgba(255,255,255,.06);
          color:#fff; font-weight:700; padding:8px 14px; border-radius:999px;
          transition: box-shadow .18s ease, background .18s ease;
        }
        .vo-chip:hover{ box-shadow: var(--ring-inner), var(--ring-outer); }
        .vo-chip.danger{ border-color: rgba(255,99,99,.45); }

        .vo-error{
          margin-top:10px; padding:10px 12px; border:1px solid rgba(255,99,99,.35);
          background: rgba(255,99,99,.08); color:#ffd7d7; border-radius:12px;
        }

        .vo-actions{ margin-top:14px; display:flex; justify-content:flex-end; gap:12px; }
        .vo-actions.between{ justify-content:space-between; }

        /* ===== LED BUTTON: transparent base; green ring; inner+outer glow; stronger on hover; text color unchanged ===== */
        .vo-cta{
          border:1px solid var(--led);
          background: transparent;
          color:#fff; font-weight:900; padding:12px 18px; border-radius:999px;
          box-shadow: var(--ring-inner), var(--ring-outer);
          transition: transform .08s ease, box-shadow .18s ease, background .18s ease;
        }
        .vo-cta:hover{ transform: translateY(-1px); background: transparent; box-shadow: var(--ring-inner-strong), var(--ring-outer-strong); }
        .vo-cta:disabled{ opacity:.6; filter: grayscale(.2); cursor:not-allowed; }

        .vo-code{ opacity:.85; }
        @keyframes pulse{ 0%{opacity:.65} 50%{opacity:.30} 100%{opacity:.65} }
      `}</style>
    </div>
  )
}

export default UploadPage
