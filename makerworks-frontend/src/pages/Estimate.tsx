// src/pages/Estimate.tsx

import { useEffect, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import GlassCard from '@/components/ui/GlassCard'
import MeshlabViewer from '@/components/ui/MeshlabViewer'
import PageHeader from '@/components/ui/PageHeader'
import { Printer } from 'lucide-react'
import { toast } from 'sonner'
import { useEstimateStore } from '@/store/useEstimateStore'
import axios from '@/api/axios'
import { getEstimate } from '@/api/estimate'
import FilamentFanoutPicker from '@/components/ui/FilamentFanoutPicker'

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

export default function Estimate() {
  const {
    form,
    setForm,
    activeModel,
    setEstimateResult,
    estimateResult
  } = useEstimateStore()

  const [filaments, setFilaments] = useState<Filament[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const loadFilaments = async () => {
      try {
        const res = await axios.get('/filaments')
        setFilaments(res.data)
        toast.success('🎨 Filaments loaded successfully')
      } catch (err) {
        console.error('[Estimate] Failed to load filaments', err)
        toast.error('⚠️ Failed to load filaments')
      }
    }

    loadFilaments()
  }, [])

  useEffect(() => {
    if (!form || !form.filament_type || !form.colors?.length) {
      if (typeof setEstimateResult === 'function') {
        setEstimateResult(null)
      }
      return
    }

    const controller = new AbortController()
    const calculate = async () => {
      setLoading(true)

      const payload = {
        ...form,
        x_mm: Math.max(50, Math.min(256, form.x_mm)),
        y_mm: Math.max(50, Math.min(256, form.y_mm)),
        z_mm: Math.max(50, Math.min(256, form.z_mm))
      }

      try {
        const data = await getEstimate(payload)
        if (typeof setEstimateResult === 'function') {
          setEstimateResult(data)
        }
      } catch (err) {
        console.error('[Estimate] Estimate API failed:', err)
        toast.error('❌ Failed to calculate estimate')
        if (typeof setEstimateResult === 'function') {
          setEstimateResult(null)
        }
      } finally {
        setLoading(false)
      }
    }

    calculate()
    return () => controller.abort()
  }, [form])

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
        <PageHeader
          icon={<Printer className="w-8 h-8 text-zinc-400" />}
          title="Estimate Print Job"
        />

        <div className="grid md:grid-cols-2 gap-6">
          <GlassCard>
            <h2 className="text-lg font-semibold mb-2">Selected Model</h2>
            {activeModel?.glb_url || activeModel?.stl_url ? (
              <MeshlabViewer
                src={activeModel.glb_url}
                fallbackSrc={activeModel.stl_url}
                background="#f8fafc"
              />
            ) : (
              <div className="text-sm text-zinc-500">No model selected.</div>
            )}
          </GlassCard>

          <GlassCard>
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
                      onChange={(e) =>
                        setForm({ [dim]: +e.target.value })
                      }
                      placeholder={dim.toUpperCase()}
                      className="w-full rounded-md border p-2 dark:bg-zinc-800 bg-white/80 text-center text-zinc-800 dark:text-zinc-100"
                    />
                  ))}
                </div>
              </div>

              <FilamentFanoutPicker filaments={filaments} />

              <div>
                <label className="block text-sm font-medium mb-1">
                  Custom Text
                </label>
                <input
                  type="text"
                  value={form.custom_text ?? ''}
                  onChange={(e) =>
                    setForm({ custom_text: e.target.value })
                  }
                  className="w-full rounded-md border p-2 dark:bg-zinc-800 bg-white/80 text-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Print Profile
                </label>
                <select
                  value={form.print_profile ?? 'standard'}
                  onChange={(e) =>
                    setForm({ print_profile: e.target.value })
                  }
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

        <GlassCard className="mt-6 text-center">
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
