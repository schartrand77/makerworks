// src/pages/Upload.tsx

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import toast, { Toaster } from 'react-hot-toast'
import axios from '@/api/client'
import { useAuthStore } from '@/store/useAuthStore'

const allowedModelExtensions = ['stl', '3mf', 'obj']

const Glass: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ style, className, ...rest }) => (
  <div
    style={{
      border: '2px solid rgba(255, 255, 255, 0.12)',
      borderRadius: 16,
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(18px) saturate(180%)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
      ...style,
    }}
    className={className}
    {...rest}
  />
)

const CARD_WIDTH = 450 // each card ~half the old width

const UploadPage: React.FC = () => {
  // auth
  const { user } = useAuthStore.getState ? useAuthStore() : ({ user: undefined } as any)

  // ---------- MODEL CARD STATE ----------
  const [modelLoading, setModelLoading] = useState(false)
  const [modelProgress, setModelProgress] = useState(0)
  const [modelFile, setModelFile] = useState<File | null>(null)
  const [modelRejected, setModelRejected] = useState<string[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [credit, setCredit] = useState('')

  // Track the last uploaded model id for this session (so photos can attach automatically)
  const [lastModelId, setLastModelId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('last_model_id') || null
    } catch { return null }
  })

  // ---------- PHOTOS CARD STATE ----------
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosProgress, setPhotosProgress] = useState(0)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoRejected, setPhotoRejected] = useState<string[]>([])
  const [attachModelId, setAttachModelId] = useState<string>('') // optional override
  const effectiveModelId = useMemo(
    () => (attachModelId?.trim() ? attachModelId.trim() : lastModelId || ''),
    [attachModelId, lastModelId]
  )

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
    } catch { /* no-op */ }
    return undefined
  }

  // ---------- MODEL DROPZONE ----------
  const onDropModel = useCallback((acceptedFiles: File[], fileRejections) => {
    setModelRejected([])
    setModelFile(null)
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

  // ---------- PHOTOS DROPZONE ----------
  const onDropPhotos = useCallback((acceptedFiles: File[], fileRejections) => {
    setPhotoRejected([])
    setPhotosProgress(0)

    // Allow up to 3 images total
    const combined = [...photoFiles, ...acceptedFiles].slice(0, 3)
    const rejectedNames: string[] = []

    // filter to image/* only and max 25MB each (light front-end enforcement)
    const filtered = combined.filter((f) => {
      const okType = f.type.startsWith('image/')
      const okSize = f.size <= 25 * 1024 * 1024
      if (!okType || !okSize) rejectedNames.push(f.name)
      return okType && okSize
    })

    if (rejectedNames.length) {
      toast.error(`🚫 Rejected: ${rejectedNames.join(', ')}`)
    }
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
    if (!modelFile) {
      toast.error('❌ No model file selected.')
      return
    }
    if (!name.trim()) {
      toast.error('❌ Name is required.')
      return
    }

    setModelLoading(true)
    try {
      const res = await uploadModelWithProgress(modelFile)
      const modelId = (res?.data?.model?.id || res?.data?.id) as string | undefined
      toast.success(`✅ Model uploaded${modelId ? ` (${modelId.slice(0, 8)}…)` : ''}.`)

      if (modelId) {
        setLastModelId(modelId)
        try { localStorage.setItem('last_model_id', modelId) } catch { /* ignore */ }
        if (!attachModelId.trim()) setAttachModelId(modelId) // seed photos card
      }

      // reset form
      setModelFile(null)
      setModelProgress(0)
      setName('')
      setDescription('')
      setTags('')
      setCredit('')
    } catch (err: any) {
      const code = err?.response?.status
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error'
      toast.error(`❌ Upload failed${code ? ` (${code})` : ''}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
      console.error('[Upload] model error:', err)
    } finally {
      setModelLoading(false)
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
    const userId = resolveUserId()
    if (!userId) {
      toast.error('❌ Missing user id (X-User-Id). Sign in again.')
      return
    }

    const form = new FormData()
    // backend expects "files" (plural) list
    photoFiles.forEach((f) => form.append('files', f))

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
      toast.success('📸 Thumbnails uploaded.')
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

  // ---------- UI ----------
  return (
    <div
      className="upload-container"
      style={{
        // wide enough to center two cards; wraps on small screens
        maxWidth: 'min(95vw, 940px)',
        margin: '2rem auto',
        color: '#d1d5db',
      }}
    >
      <Toaster position="top-right" />
      <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Upload a 3D Model &amp; Print Photos</h2>

      {/* Row: two cards side-by-side, centered */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        {/* CARD 1 — Model Upload */}
        <Glass style={{ padding: 24, width: `min(90vw, ${CARD_WIDTH}px)` }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>1) 3D Model</h3>

          {/* Dropzone */}
          <div
            {...getModelRootProps()}
            style={{
              border: `2px solid ${isModelDrag ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: 16,
              padding: 24,
              textAlign: 'center',
              cursor: modelLoading ? 'not-allowed' : 'pointer',
              opacity: modelLoading ? 0.6 : 1,
              background: 'rgba(255, 255, 255, 0.04)',
              color: '#d1d5db',
              marginBottom: 12,
            }}
          >
            <input {...getModelInputProps()} />
            <p>
              {isModelDrag ? 'Drop your model…' : 'Drag & drop your model or click to browse.'}
              <br />
              <strong>Accepted: .stl, .3mf, .obj</strong>
            </p>
          </div>

          {modelFile && (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.04)',
              }}
            >
              <p>
                📦 <strong>{modelFile.name}</strong> ({(modelFile.size / 1024).toFixed(1)} KB)
              </p>
              {modelLoading && (
                <div style={{ height: 10, background: '#333', borderRadius: 5, marginTop: 6 }}>
                  <div
                    style={{
                      width: `${modelProgress}%`,
                      height: '100%',
                      background: '#FF4F00',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6 }}>Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Model name"
                style={{ width: '100%', padding: 8, borderRadius: 8 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6 }}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the model"
                style={{ width: '100%', padding: 8, borderRadius: 8, minHeight: 80 }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6 }}>Tags (comma separated)</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g. benchy, calibration, test"
                  style={{ width: '100%', padding: 8, borderRadius: 8 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6 }}>Credit (Model creator)</label>
                <input
                  type="text"
                  value={credit}
                  onChange={(e) => setCredit(e.target.value)}
                  placeholder="Original creator's name"
                  style={{ width: '100%', padding: 8, borderRadius: 8 }}
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleUploadModel}
            disabled={modelLoading}
            style={{
              marginTop: 14,
              width: '100%',
              padding: 12,
              borderRadius: 12,
              background: '#FF6A1F',
              color: '#fff',
              fontWeight: 'bold',
              cursor: modelLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {modelLoading ? `Uploading… ${modelProgress}%` : 'Upload Model'}
          </button>

          {modelRejected.length > 0 && (
            <div style={{ color: '#f87171', marginTop: 12, textAlign: 'center' }}>
              <p>🚫 Rejected:</p>
              <ul>
                {modelRejected.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}
        </Glass>

        {/* CARD 2 — Print Photos (Thumbnails) */}
        <Glass style={{ padding: 24, width: `min(90vw, ${CARD_WIDTH}px)` }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>2) Print Photos (thumbnails)</h3>

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>
              Attach to Model ID <span style={{ opacity: 0.6 }}>(leave blank to use last uploaded)</span>
            </label>
            <input
              type="text"
              value={attachModelId}
              onChange={(e) => setAttachModelId(e.target.value)}
              placeholder={lastModelId ? `Using: ${lastModelId}` : 'Paste a model id…'}
              style={{ width: '100%', padding: 8, borderRadius: 8 }}
            />
          </div>

          <div
            {...getPhotosRootProps()}
            style={{
              border: `2px solid ${isPhotosDrag ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: 16,
              padding: 24,
              textAlign: 'center',
              cursor: photosLoading ? 'not-allowed' : 'pointer',
              opacity: photosLoading ? 0.6 : 1,
              background: 'rgba(255, 255, 255, 0.04)',
              color: '#d1d5db',
              marginBottom: 12,
            }}
          >
            <input {...getPhotosInputProps()} />
            <p>
              {isPhotosDrag ? 'Drop images…' : 'Drag & drop up to 3 images or click to browse.'}
              <br />
              <strong>Accepted: .png, .jpg, .jpeg, .webp (each ≤ 25MB)</strong>
            </p>
          </div>

          {/* Thumbs / skeleton */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, minHeight: 110 }}>
            {photosLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{
                  height: 110, borderRadius: 12, background: 'rgba(255,255,255,0.1)',
                  animation: 'pulse 1.2s ease-in-out infinite',
                }} />
              ))
            ) : photoFiles.length > 0 ? (
              <>
                {photoFiles.map((file, idx) => {
                  const url = URL.createObjectURL(file)
                  return (
                    <div key={idx} style={{ position: 'relative', height: 110 }}>
                      {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                      <img
                        src={url}
                        alt={`Selected image ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)' }}
                        onLoad={() => URL.revokeObjectURL(url)}
                      />
                    </div>
                  )
                })}
                {photoFiles.length < 3 &&
                  Array.from({ length: 3 - photoFiles.length }).map((_, i) => (
                    <div key={`blank-${i}`} style={{ height: 110, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }} />
                  ))}
              </>
            ) : (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={`empty-${i}`} style={{ height: 110, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }} />
              ))
            )}
          </div>

          {photoRejected.length > 0 && (
            <div style={{ color: '#f87171', marginTop: 12, textAlign: 'center' }}>
              <p>🚫 Rejected:</p>
              <ul>
                {photoRejected.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={handleUploadPhotos}
            disabled={photosLoading || (!effectiveModelId)}
            style={{
              marginTop: 14,
              width: '100%',
              padding: 12,
              borderRadius: 12,
              background: effectiveModelId ? '#3B82F6' : '#6B7280',
              color: '#fff',
              fontWeight: 'bold',
              cursor: photosLoading || !effectiveModelId ? 'not-allowed' : 'pointer',
            }}
            title={!effectiveModelId ? 'Upload a model first or paste a Model ID' : 'Upload images'}
          >
            {photosLoading ? `Uploading photos… ${photosProgress}%` : `Upload ${photoFiles.length || 0}/3 Photos`}
          </button>

          {lastModelId && (
            <p style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
              Last uploaded model: <code style={{ opacity: 0.85 }}>{lastModelId}</code>
            </p>
          )}
        </Glass>
      </div>

      {/* lil’ CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0% { opacity: .6 }
          50% { opacity: .35 }
          100% { opacity: .6 }
        }
      `}</style>
    </div>
  )
}

export default UploadPage
