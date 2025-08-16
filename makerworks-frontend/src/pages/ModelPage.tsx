// src/pages/ModelPage.tsx
import { useParams, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import axios from '@/api/axios'
import GlassCard from '@/components/ui/GlassCard'
import ModelViewer from '@/components/ui/ModelViewer'
import getAbsoluteUrl from '@/lib/getAbsoluteUrl'

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

  // STL metadata (from Postgres/API)
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
    // Safari compat: addListener/removeListener fallback
    if ('addEventListener' in mq) {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    } else {
      // @ts-ignore - legacy
      mq.addListener(update)
      return () => {
        // @ts-ignore - legacy
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
      // any preseeded metadata we might have
      volume_mm3: preloaded?.volume_mm3,
      surface_area_mm2: preloaded?.surface_area_mm2,
      dimensions: preloaded?.dimensions,
      triangle_count: (preloaded as any)?.triangle_count,
      vertex_count: (preloaded as any)?.vertex_count,
      unit: (preloaded as any)?.unit,
      tags: preloaded?.tags,
    }
  })

  useEffect(() => {
    let cancelled = false
    const fetchModel = async () => {
      if (!id) return
      try {
        // Primary model
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
          // carry through any metadata we already have
          volume_mm3: data.volume_mm3 ?? prev?.volume_mm3,
          surface_area_mm2: (data as any).surface_area_mm2 ?? prev?.surface_area_mm2,
          dimensions: data.dimensions ?? prev?.dimensions,
          triangle_count: (data as any).triangle_count ?? prev?.triangle_count,
          vertex_count: (data as any).vertex_count ?? prev?.vertex_count,
          unit: (data as any).unit ?? prev?.unit,
          tags: data.tags ?? prev?.tags,
        }))

        // Optional: hydrate with dedicated metadata endpoint
        try {
          const meta = await axios.get<Partial<Model>>(`/models/${id}/metadata`)
          if (!cancelled && meta?.data) {
            setModel((prev) => ({
              ...(prev as Model),
              volume_mm3: meta.data.volume_mm3 ?? prev?.volume_mm3,
              surface_area_mm2: meta.data.surface_area_mm2 ?? prev?.surface_area_mm2,
              dimensions: meta.data.dimensions ?? prev?.dimensions,
              triangle_count: meta.data.triangle_count ?? prev?.triangle_count,
              vertex_count: meta.data.vertex_count ?? prev?.vertex_count,
              unit: meta.data.unit ?? prev?.unit,
            }))
          }
        } catch {
          // endpoint optional — ignore if missing
        }
      } catch (err) {
        console.error('[ModelPage] Failed to fetch model:', err)
      }
    }
    fetchModel()
    return () => {
      cancelled = true
    }
  }, [id])

  const src = useMemo(() => model?.stl_url ?? model?.file_url ?? null, [model?.stl_url, model?.file_url])

  if (!id) {
    return (
      <main className="flex justify-center items-center h-[60vh] text-zinc-500 text-lg">
        Invalid model.
      </main>
    )
  }

  // helpers for display
  const fmt = (n?: number | null, digits = 2) =>
    typeof n === 'number' && isFinite(n) ? n.toFixed(digits) : '—'
  const toCm3 = (mm3?: number) => (typeof mm3 === 'number' ? (mm3 / 1000).toFixed(2) : '—')
  const dims = model?.dimensions

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Title + description */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{model?.name || 'Model'}</h1>
        {model?.description && (
          <p className="text-zinc-600 dark:text-zinc-400">{model.description}</p>
        )}
      </div>

      {/* Viewer + Metadata SIDE BY SIDE */}
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

          {/* Device-aware control legend */}
          <ControlsLegend />
        </GlassCard>

        {/* Metadata card (beside viewer) */}
        <GlassCard className="glass p-4 ring-1 ring-black/5 dark:ring-white/20 lg:col-span-4">
          <h2 className="text-lg font-semibold mb-3">Model Metadata</h2>
          <dl className="text-sm text-zinc-700 dark:text-zinc-300 grid grid-cols-1 gap-2">
            {model?.uploader_username && (
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Uploader</dt>
                <dd className="font-medium">{model.uploader_username}</dd>
              </div>
            )}
            {model?.created_at && (
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Created</dt>
                <dd className="font-medium">
                  {new Date(model.created_at).toLocaleString()}
                </dd>
              </div>
            )}
            {model?.updated_at && (
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Updated</dt>
                <dd className="font-medium">
                  {new Date(model.updated_at).toLocaleString()}
                </dd>
              </div>
            )}

            <div className="h-px my-1 bg-zinc-200/60 dark:bg-zinc-700/60" />

            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Units</dt>
              <dd className="font-medium">{model?.unit?.toUpperCase() || 'mm'}</dd>
            </div>

            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Dimensions (mm)</dt>
              <dd className="font-medium">
                {dims ? `X ${fmt(dims.x, 1)} × Y ${fmt(dims.y, 1)} × Z ${fmt(dims.z, 1)}` : '—'}
              </dd>
            </div>

            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500 dark:text-zinc-400">Volume</dt>
              <dd className="font-medium">{toCm3(model?.volume_mm3)} cm³</dd>
            </div>

            {typeof model?.surface_area_mm2 === 'number' && (
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Surface Area</dt>
                <dd className="font-medium">
                  {fmt(model.surface_area_mm2)} mm²
                </dd>
              </div>
            )}

            {(typeof model?.triangle_count === 'number' ||
              typeof model?.vertex_count === 'number') && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500 dark:text-zinc-400">Triangles</dt>
                  <dd className="font-medium">
                    {typeof model?.triangle_count === 'number' ? model.triangle_count : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500 dark:text-zinc-400">Vertices</dt>
                  <dd className="font-medium">
                    {typeof model?.vertex_count === 'number' ? model.vertex_count : '—'}
                  </dd>
                </div>
              </>
            )}

            {model?.tags && model.tags.length > 0 && (
              <>
                <div className="h-px my-1 bg-zinc-200/60 dark:bg-zinc-700/60" />
                <div className="flex items-start gap-3">
                  <dt className="text-zinc-500 dark:text-zinc-400 mt-1">Tags</dt>
                  <dd className="flex flex-wrap gap-1">
                    {model.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block bg-zinc-200 dark:bg-zinc-700 text-xs px-2 py-1 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </GlassCard>
      </div>
    </main>
  )
}

export default ModelPage
