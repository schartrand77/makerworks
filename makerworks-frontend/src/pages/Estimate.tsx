// src/pages/Estimate.tsx
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import PageLayout from '@/components/layout/PageLayout'
import GlassCard from '@/components/ui/GlassCard'
import PageHeader from '@/components/ui/PageHeader'
import ModelViewer from '@/components/ui/ModelViewer'
import { Printer, X } from 'lucide-react'
import { toast } from 'sonner'
import { useEstimateStore } from '@/store/useEstimateStore'
import axios from '@/api/axios'
import { getEstimate } from '@/api/estimate'
import FilamentFanoutPicker from '@/components/ui/FilamentFanoutPicker'
import getAbsoluteUrl from '@/lib/getAbsoluteUrl'

interface EstimateResult {
  estimated_time_minutes: number
  estimated_cost_usd: number
}

interface Filament {
  id: string
  type: string
  color: string
  hex: string
}

// shape we expect from navigation state
type FromModel = {
  id?: string | null
  name?: string | null
  description?: string | null
  src?: string | null           // stl/glb/3mf url
  thumbnail_url?: string | null
  glb_url?: string | null       // optional
  stl_url?: string | null       // optional
}

export default function Estimate() {
  const location = useLocation()
  const {
    form,
    setForm,
    activeModel,
    // optional in your store; we guard its usage
    setActiveModel,
    setEstimateResult,
    estimateResult
  } = useEstimateStore() as any

  const [filaments, setFilaments] = useState<Filament[]>([])
  const [loading, setLoading] = useState(false)
  const [localModel, setLocalModel] = useState<Partial<FromModel> | null>(null)

  // When navigated from "Get estimate", seed model for viewer
  useEffect(() => {
    const fm: FromModel | undefined = (location.state as any)?.fromModel
    if (!fm) return

    const normalized: FromModel = {
      id: fm.id ?? null,
      name: fm.name ?? null,
      description: fm.description ?? null,
      thumbnail_url: getAbsoluteUrl(fm.thumbnail_url || '') || fm.thumbnail_url || null,
      glb_url: getAbsoluteUrl(fm.glb_url || '') || fm.glb_url || null,
      stl_url: getAbsoluteUrl(fm.stl_url || '') || fm.stl_url || null,
      src: getAbsoluteUrl(fm.src || '') || fm.src || null,
    }

    // Prefer store if provided; otherwise hold locally
    if (typeof setActiveModel === 'function') {
      setActiveModel(normalized)
    } else {
      setLocalModel(normalized)
    }
    toast.success('✅ Model loaded into estimator')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // Load filaments (choices for picker)
  useEffect(() => {
    const loadFilaments = async () => {
      try {
        const res = await axios.get('/filaments')
        setFilaments(res.data)
      } catch (err) {
        console.error('[Estimate] Failed to load filaments', err)
        toast.error('⚠️ Failed to load filaments')
      }
    }
    loadFilaments()
  }, [])

  // Recalculate when form changes
  useEffect(() => {
    if (!form || !form.filament_type || !form.colors?.length) {
      if (typeof setEstimateResult === 'function') setEstimateResult(null)
      return
    }

    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      const payload = {
        ...form,
        // keep dimensions sane
        x_mm: Math.max(50, Math.min(256, form.x_mm)),
        y_mm: Math.max(50, Math.min(256, form.y_mm)),
        z_mm: Math.max(50, Math.min(256, form.z_mm)),
      }
      try {
        const data: EstimateResult = await getEstimate(payload)
        if (typeof setEstimateResult === 'function') setEstimateResult(data)
      } catch (err) {
        console.error('[Estimate] Estimate API failed:', err)
        toast.error('❌ Failed to calculate estimate')
        if (typeof setEstimateResult === 'function') setEstimateResult(null)
      } finally {
        setLoading(false)
      }
    }
    run()

    return () => controller.abort()
  }, [form, setEstimateResult])

  // pick model data (store if available, else local)
  const modelForViewer = useMemo(() => {
    const m = (activeModel as FromModel) ?? localModel ?? {}
    // prefer explicit glb_url if present; else src; fall back to stl_url
    const src = m.glb_url || m.src || m.stl_url || null
    const fallbackSrc = m.stl_url || null
    return { m, src, fallbackSrc }
  }, [activeModel, localModel])

  // Clear model from store/local
  const handleClearModel = () => {
    try {
      if (typeof setActiveModel === 'function') {
        ;(setActiveModel as any)(null)
      }
    } catch {
      // some stores might expect an empty object instead of null
      try { (setActiveModel as any)({}) } catch {}
    }
    setLocalModel(null)
    toast.success('🧹 Cleared selected model')
  }

  if (!form) {
    return (
      <PageLayout>
        <PageHeader icon={<Printer className="w-8 h-8 text-zinc-400" />} title="Estimate Print Job" />
        <GlassCard className="text-center py-12">
          <p className="text-zinc-500 dark:text-zinc-300 text-sm">Loading estimate form…</p>
        </GlassCard>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <PageHeader icon={<Printer className="w-8 h-8 text-zinc-400" />} title="Estimate Print Job" />

        <div className="grid md:grid-cols-2 gap-6">
          <GlassCard className="p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Selected Model</h2>
              {(modelForViewer.src || modelForViewer.m?.id) && (
                <button
                  type="button"
                  onClick={handleClearModel}
                  className="
                    inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
                    backdrop-blur-xl bg-white/60 dark:bg-white/10
                    border border-black/10 dark:border-white/15
                    text-zinc-800 dark:text-zinc-100
                    hover:bg-white/70 dark:hover:bg-white/15 transition
                  "
                  title="Clear selected model"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>

            {modelForViewer.src ? (
              <div className="relative w-full">
                <ModelViewer
                  src={modelForViewer.src || undefined}
                  fallbackSrc={modelForViewer.fallbackSrc || undefined}
                  color="#9a9a9a"
                  fitMargin={1.6}
                  // Match ModelPage sizing so it feels consistent
                  className="h-[36vh] sm:h-[42vh] lg:h-[46vh] rounded-2xl"
                />
                {/* tiny hint, same language as ModelPage */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs select-none text-zinc-700 dark:text-zinc-300">
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
              </div>
            ) : (
              <div className="text-sm text-zinc-500">No model selected.</div>
            )}

            {modelForViewer.m?.name && (
              <div className="mt-3">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {modelForViewer.m.name}
                </div>
                {modelForViewer.m.description && (
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {modelForViewer.m.description}
                  </div>
                )}
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-4">
            <h2 className="text-lg font-semibold mb-2">Print Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Dimensions (mm) <span className="text-xs">(50–256)</span>
                </label>
                <div className="flex gap-2">
                  {(['x_mm', 'y_mm', 'z_mm'] as const).map((dim) => (
                    <input
                      key={dim}
                      id={dim}
                      type="number"
                      min={50}
                      max={256}
                      required
                      value={form[dim] ?? ''}
                      onChange={(e) => setForm({ [dim]: +e.target.value })}
                      placeholder={dim.toUpperCase()}
                      className="w-full rounded-md border p-2 dark:bg-zinc-800 bg-white/80 text-center text-zinc-800 dark:text-zinc-100"
                    />
                  ))}
                </div>
              </div>

              <FilamentFanoutPicker filaments={filaments} />

              <div>
                <label className="block text-sm font-medium mb-1">Custom Text</label>
                <input
                  type="text"
                  value={form.custom_text ?? ''}
                  onChange={(e) => setForm({ custom_text: e.target.value })}
                  className="w-full rounded-md border p-2 dark:bg-zinc-800 bg-white/80 text-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Print Profile</label>
                <select
                  value={form.print_profile ?? 'standard'}
                  onChange={(e) => setForm({ print_profile: e.target.value })}
                  className="w-full rounded-md border p-2 dark:bg-zinc-800 bg-white/80 text-zinc-800 dark:text-zinc-100"
                >
                  <option value="standard">Standard</option>
                  <option value="quality">Quality</option>
                  <option value="elite">Elite</option>
                </select>
              </div>
            </div>
          </GlassCard>
        </div>

        <GlassCard className="mt-6 text-center p-4">
          <h2 className="text-lg font-semibold mb-2">Live Estimate</h2>

          {loading && (
            <div className="text-brand-blue animate-pulse py-2">🔄 Calculating…</div>
          )}

          {!loading && estimateResult && (
            <div className="flex flex-col sm:flex-row justify-center gap-6 text-base text-zinc-800 dark:text-zinc-200 mt-2">
              <div className="bg-white/20 dark:bg-zinc-700/30 p-4 rounded-lg shadow backdrop-blur">
                <strong>Estimated Time</strong>
                <div>{Math.round(estimateResult.estimated_time_minutes)} minutes</div>
              </div>
              <div className="bg-white/20 dark:bg-zinc-700/30 p-4 rounded-lg shadow backdrop-blur">
                <strong>Estimated Cost</strong>
                <div>${estimateResult.estimated_cost_usd.toFixed(2)}</div>
              </div>
            </div>
          )}

          {!loading && !estimateResult && (
            <div className="text-sm text-zinc-500 mt-2">
              Select filament & at least one color to calculate.
            </div>
          )}
        </GlassCard>
      </div>
    </PageLayout>
  )
}
