// src/pages/ModelPage.tsx
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import axios from '@/api/client'
import ModelViewer from '@/components/ui/ModelViewer'
import getAbsoluteUrl from '@/lib/getAbsoluteUrl'
import GlassCard from '@/components/ui/GlassCard'

interface Dimensions { x: number; y: number; z: number }
interface Model {
  id: string
  name?: string | null
  description?: string | null
  uploader_username?: string | null
  stl_url?: string | null
  file_url?: string | null
  thumbnail_url?: string | null
  webm_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  volume_mm3?: number | null
  surface_area_mm2?: number | null
  dimensions?: Dimensions | null
  triangle_count?: number | null
  vertex_count?: number | null
  unit?: string | null
  tags?: string[] | null
}

interface Photo {
  id: string
  url: string | null
  thumbnail_url?: string | null
  caption?: string | null
  created_at?: string | null
}

function abs(url?: string | null) {
  if (!url) return null
  return getAbsoluteUrl(url) || url
}

/** Controls hint as plain text (no chips, no container) */
function ControlsHintText() {
  const [coarse, setCoarse] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setCoarse(!!mq.matches)
    update()
    if ('addEventListener' in mq) {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    } else {
      // @ts-ignore Safari
      mq.addListener(update)
      return () => {
        // @ts-ignore Safari
        mq.removeListener(update)
      }
    }
  }, [])

  const items = coarse
    ? [
        ['One-finger drag', 'rotate'],
        ['Two-finger drag', 'pan'],
        ['Pinch', 'zoom'],
      ]
    : [
        ['Left-drag', 'rotate'],
        ['Right-drag', 'pan'],
        ['Scroll / pinch', 'zoom'],
      ]

  const text = items.map(([a, b]) => `${a} · ${b}`).join('   •   ')
  return (
    <div className="text-[10px] sm:text-[11px] text-white/70 select-none leading-relaxed">
      {text}
    </div>
  )
}

const ModelPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [model, setModel] = useState<Model | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState<boolean>(false)

  // smart back
  const location = useLocation() as any
  const navigate = useNavigate()
  const backFromState: string | undefined = location?.state?.from
  const backHref = backFromState || '/browse'
  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault()
    if (backFromState) { navigate(backFromState); return }
    try {
      const ref = document.referrer
      if (ref && new URL(ref).origin === window.location.origin) { navigate(-1); return }
    } catch {}
    navigate('/browse')
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!id) return
      try {
        const res = await axios.get<Model>(`/models/${id}`)
        if (cancelled) return
        const d = res.data || {}
        setModel({
          id,
          name: d.name ?? null,
          description: d.description ?? null,
          uploader_username: d.uploader_username ?? null,
          thumbnail_url: abs(d.thumbnail_url) ?? null,
          stl_url: abs((d as any).stl_url ?? (d as any).file_url ?? null),
          file_url: abs((d as any).file_url) ?? null,
          webm_url: abs((d as any).webm_url) ?? null,
          created_at: d.created_at ?? null,
          updated_at: d.updated_at ?? null,
          volume_mm3: d.volume_mm3 ?? null,
          surface_area_mm2: (d as any).surface_area_mm2 ?? null,
          dimensions: d.dimensions ?? null,
          triangle_count: (d as any).triangle_count ?? null,
          vertex_count: (d as any).vertex_count ?? null,
          unit: (d as any).unit ?? null,
          tags: d.tags ?? null,
        })
      } catch (e) {
        console.error('[ModelPage] fetch failed', e)
      }
    }
    run()
    return () => { cancelled = true }
  }, [id])

  // bottom-strip photos
  useEffect(() => {
    let cancelled = false
    const loadPhotos = async () => {
      if (!id) return
      setLoadingPhotos(true)
      try {
        const res = await axios.get<{ items?: Photo[] } | Photo[]>(`/upload/models/${id}/photos`)
        if (cancelled) return
        const arr = Array.isArray(res.data) ? res.data : res.data.items || []
        const mapped = (arr || [])
          .map((p) => ({ ...p, url: abs(p.url), thumbnail_url: abs(p.thumbnail_url ?? p.url) }))
          .filter((p) => p.thumbnail_url)
          .sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0))
          .slice(0, 3)
        setPhotos(mapped)
      } catch (e) {
        console.error('[ModelPage] photos fetch failed', e)
        setPhotos([])
      } finally {
        setLoadingPhotos(false)
      }
    }
    loadPhotos()
    return () => { cancelled = true }
  }, [id])

  const src = useMemo(() => model?.stl_url ?? model?.file_url ?? null, [model?.stl_url, model?.file_url])

  const handleEstimate = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!id) return
    const modelUrl = src || null
    navigate('/estimate', {
      state: {
        modelId: id,
        modelUrl,
        fromModel: { id, name: model?.name ?? null, description: model?.description ?? null, src: modelUrl, thumbnail_url: model?.thumbnail_url ?? null },
        from: `/models/${id}`,
      },
    })
  }

  if (!id) {
    return <main className="flex justify-center items-center h-[60svh] text-zinc-500 text-lg">Invalid model.</main>
  }

  const canEstimate = !!(id && src)

  return (
    <main
      className={[
        'relative min-h-[100svh] pt-3 pb-8 px-4',
        'bg-[radial-gradient(60%_40%_at_20%_0%,rgba(99,102,241,0.15),transparent_60%),',
        'radial-gradient(50%_50%_at_100%_20%,rgba(16,185,129,0.12),transparent_60%),',
        'linear-gradient(180deg,rgba(0,0,0,0.035),rgba(0,0,0,0.035))]',
      ].join(' ')}
    >
      <GlassCard className="mx-auto max-w-7xl p-4 rounded-3xl backdrop-blur-2xl ring-1 ring-white/15 shadow-[0_10px_50px_-15px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.4)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link to={backHref} onClick={handleBack} className="mw-btn mw-btn-sm mw-btn--quiet" title="Back">← Back</Link>
          <button onClick={handleEstimate} disabled={!canEstimate} className="mw-btn mw-btn-lg" title={canEstimate ? 'Send this model to the estimator' : 'Model not ready yet'}>
            Get estimate →
          </button>
        </div>

        <div className="relative w-full">
          <ModelViewer
            key={src || 'no-src'}
            src={src || undefined}
            color="#9a9a9a"
            fitMargin={1.6}
            className="h-[36vh] sm:h-[42vh] lg:h-[46vh] rounded-2xl"
          />

          {/* TEXT-ONLY OVERLAY (no container) */}
          {(model?.name || model?.description) && (
            <div className="absolute left-2 right-2 bottom-2 sm:left-3 sm:right-3 sm:bottom-3 pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
              <div className="flex flex-col gap-1.5">
                <div className="text-[12px] sm:text-sm font-semibold text-white/90 leading-tight">
                  {model?.name || 'Untitled'}
                </div>
                {model?.description && (
                  <div className="text-[11px] sm:text-[12px] text-white/75 leading-snug line-clamp-2">
                    {model.description}
                  </div>
                )}
                <ControlsHintText />
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* bottom strip: 3 real photos (fixed clipping) */}
      <GlassCard className="mx-auto max-w-7xl mt-3 p-3 sm:p-4 rounded-3xl backdrop-blur-2xl ring-1 ring-white/15 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.35)]">
        <div className="w-full h-[9vh] sm:h-[10.5vh] lg:h-[11.5vh]">
          {loadingPhotos ? (
            <div className="grid grid-cols-3 gap-3 h-full">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-full rounded-2xl bg-white/10 animate-pulse" />
              ))}
            </div>
          ) : photos.length > 0 ? (
            <div className="grid grid-cols-3 gap-3 h-full">
              {photos.map((p) => {
                const full = p.url || undefined
                const thumb = p.thumbnail_url || p.url || ''
                return (
                  <a
                    key={p.id}
                    href={full}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full group overflow-hidden rounded-2xl ring-1 ring-white/15"
                    title={p.caption || 'Open full image'}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumb || undefined}
                      alt={p.caption || 'Printed model photo'}
                      className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                      onError={(e) => { if (full && e.currentTarget.src !== full) e.currentTarget.src = full }}
                      draggable={false}
                    />
                  </a>
                )
              })}
              {photos.length < 3 &&
                Array.from({ length: 3 - photos.length }).map((_, i) => (
                  <div key={`blank-${i}`} className="h-full rounded-2xl ring-1 ring-white/10 bg-white/5" />
                ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-white/80 rounded-2xl bg-white/5 ring-1 ring-white/10">
              No photos yet.
            </div>
          )}
        </div>
      </GlassCard>
    </main>
  )
}

export default ModelPage
