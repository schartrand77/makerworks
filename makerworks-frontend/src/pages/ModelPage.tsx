// src/pages/ModelPage.tsx
import { useParams, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState, useCallback } from 'react'
import axios from '@/api/axios'
import GlassCard from '@/components/ui/GlassCard'
import ModelViewer from '@/components/ui/ModelViewer'
import getAbsoluteUrl from '@/lib/getAbsoluteUrl'
import { useAuthStore } from '@/store/useAuthStore'

interface Dimensions {
  x: number
  y: number
  z: number
}

interface Model {
  id: string
  name?: string
  description?: string
  uploader_username?: string
  stl_url?: string | null
  file_url?: string | null
  thumbnail_url?: string | null
  webm_url?: string | null
  created_at?: string
  updated_at?: string

  // (We still keep these around in case you show them somewhere else later)
  volume_mm3?: number
  surface_area_mm2?: number
  dimensions?: Dimensions
  triangle_count?: number
  vertex_count?: number
  unit?: string
  tags?: string[]
}

type LocationState = {
  preloaded?: Partial<Model>
  from?: string
}

interface Photo {
  id: string
  url: string | null
  thumbnail_url?: string | null
  caption?: string | null
  uploaded_by?: string | null
  created_at?: string | null
  is_featured?: boolean
}

function abs(url?: string | null) {
  if (!url) return null
  return getAbsoluteUrl(url) || url
}

/** Small legend under the viewer that adapts to input type (touch vs mouse). */
function ControlsLegend() {
  const [isCoarse, setIsCoarse] = useState(false) // true == touch-like pointer

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setIsCoarse(!!mq.matches)
    update()
    if ('addEventListener' in mq) {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    } else {
      // @ts-ignore legacy Safari
      mq.addListener(update)
      return () => {
        // @ts-ignore legacy Safari
        mq.removeListener(update)
      }
    }
  }, [])

  return (
    <div className="mt-3 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
      {isCoarse ? (
        <ul className="list-disc pl-5 space-y-1">
          <li><span className="font-medium">One-finger drag:</span> rotate</li>
          <li><span className="font-medium">Two-finger drag:</span> pan</li>
          <li><span className="font-medium">Pinch:</span> zoom</li>
        </ul>
      ) : (
        <ul className="list-disc pl-5 space-y-1">
          <li><span className="font-medium">Left-click + drag:</span> rotate</li>
          <li><span className="font-medium">Right-click + drag:</span> pan</li>
          <li><span className="font-medium">Scroll wheel / pinch (trackpad):</span> zoom</li>
        </ul>
      )}
    </div>
  )
}

const ModelPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const { preloaded } = (location.state || {}) as LocationState
  const { user } = useAuthStore()
  const isAdmin =
    (user as any)?.is_admin === true ||
    (user as any)?.role === 'admin' ||
    Array.isArray((user as any)?.permissions) && (user as any).permissions.includes('admin')

  // Seed with preloaded to render instantly; hydrate from API next
  const [model, setModel] = useState<Model | null>(() => {
    if (!preloaded && !id) return null
    return {
      id: (preloaded?.id as string) || (id as string),
      name: preloaded?.name,
      description: preloaded?.description,
      uploader_username: preloaded?.uploader_username,
      thumbnail_url: abs(preloaded?.thumbnail_url ?? null),
      stl_url: abs(preloaded?.stl_url ?? preloaded?.file_url ?? null),
      file_url: abs(preloaded?.file_url ?? null),
      webm_url: abs(preloaded?.webm_url ?? null),
      volume_mm3: preloaded?.volume_mm3,
      surface_area_mm2: preloaded?.surface_area_mm2,
      dimensions: preloaded?.dimensions,
      triangle_count: (preloaded as any)?.triangle_count,
      vertex_count: (preloaded as any)?.vertex_count,
      unit: (preloaded as any)?.unit,
      tags: preloaded?.tags,
    }
  })

  const [photos, setPhotos] = useState<Photo[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [uploading, setUploading] = useState(false)

  const fetchPhotos = useCallback(async () => {
    if (!id) return
    setLoadingPhotos(true)
    try {
      // Expecting { items: Photo[] } or Photo[]
      const res = await axios.get<{ items?: Photo[] } | Photo[]>(`/models/${id}/photos`)
      const items = Array.isArray(res.data) ? res.data : (res.data.items || [])
      setPhotos(
        (items || []).map((p: Photo) => ({
          ...p,
          url: abs(p.url),
          thumbnail_url: abs(p.thumbnail_url ?? p.url),
        }))
      )
    } catch (e) {
      console.error('[ModelPage] Failed to fetch photos:', e)
      setPhotos([])
    } finally {
      setLoadingPhotos(false)
    }
  }, [id])

  const handleUpload = async (files: FileList | null) => {
    if (!files || !isAdmin || !id) return
    setUploading(true)
    try {
      const arr = Array.from(files)
      for (const f of arr) {
        const form = new FormData()
        form.append('file', f)
        // Optionally include caption, featured, etc.
        await axios.post(`/models/${id}/photos`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      await fetchPhotos()
    } catch (e) {
      console.error('[ModelPage] Photo upload failed:', e)
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const fetchModel = async () => {
      if (!id) return
      try {
        const res = await axios.get<Model>(`/models/${id}`)
        if (cancelled) return
        const data = res.data || {}
        setModel((prev) => ({
          id,
          name: data.name ?? prev?.name,
          description: data.description ?? prev?.description,
          uploader_username: data.uploader_username ?? prev?.uploader_username,
          thumbnail_url: abs(data.thumbnail_url ?? prev?.thumbnail_url ?? null),
          stl_url: abs((data as any).stl_url ?? (data as any).file_url ?? prev?.stl_url ?? null),
          file_url: abs((data as any).file_url ?? prev?.file_url ?? null),
          webm_url: abs((data as any).webm_url ?? prev?.webm_url ?? null),
          created_at: data.created_at ?? prev?.created_at,
          updated_at: data.updated_at ?? prev?.updated_at,
          volume_mm3: data.volume_mm3 ?? prev?.volume_mm3,
          surface_area_mm2: (data as any).surface_area_mm2 ?? prev?.surface_area_mm2,
          dimensions: data.dimensions ?? prev?.dimensions,
          triangle_count: (data as any).triangle_count ?? prev?.triangle_count,
          vertex_count: (data as any).vertex_count ?? prev?.vertex_count,
          unit: (data as any).unit ?? prev?.unit,
          tags: data.tags ?? prev?.tags,
        }))

        // Optional: dedicated metadata endpoint (kept for future, but we don't show it here)
        try {
          await axios.get<Partial<Model>>(`/models/${id}/metadata`)
          // If you want to merge extra fields later, do it here.
        } catch {
          /* ignore */
        }
      } catch (err) {
        console.error('[ModelPage] Failed to fetch model:', err)
      }
    }
    fetchModel()
    fetchPhotos()
    return () => {
      cancelled = true
    }
  }, [id, fetchPhotos])

  const src = useMemo(() => model?.stl_url ?? model?.file_url ?? null, [model?.stl_url, model?.file_url])

  if (!id) {
    return (
      <main className="flex justify-center items-center h-[60vh] text-zinc-500 text-lg">
        Invalid model.
      </main>
    )
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Title + description */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{model?.name || 'Model'}</h1>
        {model?.description && (
          <p className="text-zinc-600 dark:text-zinc-400">{model.description}</p>
        )}
      </div>

      {/* Viewer + Photos SIDE BY SIDE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* BIG viewer */}
        <GlassCard className="glass p-3 sm:p-4 ring-1 ring-black/5 dark:ring-white/20 lg:col-span-8">
          <div className="relative w-full h-[58vh] sm:h-[64vh] lg:h-[72vh]">
            <ModelViewer
              key={src || 'no-src'}
              src={src || undefined}
              color="#9a9a9a"
              className="absolute inset-0 w-full h-full rounded-xl overflow-hidden bg-transparent"
            />
          </div>
          <ControlsLegend />
        </GlassCard>

        {/* Real-life Prints (admin-focused) */}
        <GlassCard className="glass p-4 ring-1 ring-black/5 dark:ring-white/20 lg:col-span-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Real-life Prints</h2>
            {isAdmin && (
              <label className="inline-flex items-center gap-2 text-xs sm:text-sm px-3 py-1.5 rounded-full bg-white/70 dark:bg-white/10 ring-1 ring-black/5 dark:ring-white/20 cursor-pointer">
                {uploading ? 'Uploading…' : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files)}
                  disabled={uploading}
                />
              </label>
            )}
          </div>

          {loadingPhotos ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-zinc-300/30 dark:bg-zinc-700/30 animate-pulse" />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              No photos yet.
              {isAdmin && ' Be a hero and upload a glamour shot or two.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((p) => {
                const full = p.url ? p.url : undefined
                const thumb = p.thumbnail_url || p.url || ''
                return (
                  <a
                    key={p.id}
                    href={full}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                    title={p.caption || 'Open full image'}
                  >
                    <div className="aspect-square overflow-hidden rounded-lg ring-1 ring-black/5 dark:ring-white/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb || undefined}
                        alt={p.caption || 'Printed model photo'}
                        className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]"
                        onError={(e) => {
                          // graceful fallback to full image if thumb 404s
                          if (full && e.currentTarget.src !== full) {
                            e.currentTarget.src = full
                          }
                        }}
                        draggable={false}
                      />
                    </div>
                    {p.caption && (
                      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                        {p.caption}
                      </div>
                    )}
                  </a>
                )
              })}
            </div>
          )}
        </GlassCard>
      </div>
    </main>
  )
}

export default ModelPage
