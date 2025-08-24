import React, { useEffect, useMemo, useState } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import ModelViewer from '@/components/ui/ModelViewer'
import { fetchAvailableFilaments } from '@/api/filaments'
import { toast } from 'sonner'

interface Filament {
  id: string
  type: string // e.g., PLA, PETG
  color: string // display name, e.g., "Sun Orange"
  hex: string   // "#RRGGBB"
}

interface EstimateForm {
  height: number
  width: number
  length: number
  filamentType: string
  colors: string[] // selected color hexes (derived from AMS slots)
  customText: string
  speed: 'standard' | 'quality' | 'elite'
}

/** Shared amber ring spec (matches Cart). */
const AMBER_RING =
  'border-amber-400/45 ring-1 ring-amber-400/40 hover:ring-amber-400/60 focus-within:ring-amber-400/70'
const INNER_GLOW =
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]'

/** Keep text readable on any background color */
function textOn(hex?: string) {
  if (!hex) return '#0a0a0a'
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return L > 0.58 ? '#0a0a0a' : '#ffffff'
}

/** Inline AMS tray preview (4 slots) */
function AmsTray({
  slots,
  onSlotClick,
}: {
  slots: { slot: 1 | 2 | 3 | 4; filament?: Filament | null }[]
  onSlotClick?: (slot: number) => void
}) {
  const ordered = [...slots].sort((a, b) => a.slot - b.slot)

  return (
    <div
      className={[
        'w-full select-none rounded-2xl',
        'bg-white/70 dark:bg-white/10 backdrop-blur-xl p-3',
        AMBER_RING,
        INNER_GLOW,
      ].join(' ')}
      role="group"
      aria-label="AMS tray preview"
    >
      <div className="grid grid-cols-4 gap-3">
        {ordered.map(({ slot, filament }) => {
          const color = filament?.hex || '#D1D5DB'
          const fg = textOn(color)
          const material = filament?.type || '—'
          const name = filament ? `${material} · ${filament.color}` : 'Empty'

          return (
            <button
              key={slot}
              type="button"
              aria-label={`AMS slot ${slot}: ${name}`}
              onClick={() => onSlotClick?.(slot)}
              className={[
                'relative overflow-hidden',
                'h-20 sm:h-24 rounded-xl',
                'border border-white/25',
                'transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-amber-400/60',
              ].join(' ')}
              style={{
                background: `linear-gradient(to bottom, ${color} 0%, ${color} 60%, rgba(0,0,0,0.08) 100%)`,
              }}
            >
              {/* slot pill */}
              <span
                className="inline-flex items-center justify-center rounded-full border border-white/30 px-2.5 py-0.5 text-[10px] font-medium backdrop-blur"
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  color: fg,
                  backgroundColor: 'rgba(255,255,255,0.35)',
                }}
              >
                S{slot}
              </span>

              {/* material pill */}
              <span
                className="inline-flex items-center justify-center rounded-full border border-white/30 px-2.5 py-0.5 text-[10px] font-medium backdrop-blur"
                style={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  color: fg,
                  backgroundColor: 'rgba(0,0,0,0.25)',
                }}
              >
                {material}
              </span>

              {!filament && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ color: fg }}>
                  <span className="text-xs opacity-80">Empty</span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function EstimateCard({ modelUrl }: { modelUrl: string }) {
  const [form, setForm] = useState<EstimateForm>({
    height: 50,
    width: 50,
    length: 50,
    filamentType: '',
    colors: [],
    customText: '',
    speed: 'standard',
  })

  const [filaments, setFilaments] = useState<Filament[]>([])
  const [loadingFilaments, setLoadingFilaments] = useState(true)

  // AMS selections by slot (store filament IDs)
  const [ams, setAms] = useState<{ s1?: string; s2?: string; s3?: string; s4?: string }>({})

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetchAvailableFilaments()
        const items = Array.isArray(res)
          ? res
          : Array.isArray((res as any)?.items)
          ? (res as any).items
          : []
        setFilaments(items as Filament[])
      } catch (err) {
        console.error('[EstimateCard] Failed to load filaments:', err)
        toast.error('Failed to load filaments')
      } finally {
        setLoadingFilaments(false)
      }
    })()
  }, [])

  const byId = useMemo(() => {
    const m = new Map<string, Filament>()
    for (const f of filaments) m.set(String(f.id), f)
    return m
  }, [filaments])

  useEffect(() => {
    const list = [ams.s1, ams.s2, ams.s3, ams.s4]
      .map((id) => (id ? byId.get(String(id))?.hex : undefined))
      .filter(Boolean) as string[]

    const dedup: string[] = []
    for (const h of list) if (!dedup.includes(h)) dedup.push(h)

    setForm((f) => ({ ...f, colors: dedup.slice(0, 4) }))
  }, [ams, byId])

  const amsSlots = useMemo(
    () => [
      { slot: 1 as const, filament: ams.s1 ? byId.get(String(ams.s1)) : undefined },
      { slot: 2 as const, filament: ams.s2 ? byId.get(String(ams.s2)) : undefined },
      { slot: 3 as const, filament: ams.s3 ? byId.get(String(ams.s3)) : undefined },
      { slot: 4 as const, filament: ams.s4 ? byId.get(String(ams.s4)) : undefined },
    ],
    [ams, byId]
  )

  function updateSlot(key: 's1' | 's2' | 's3' | 's4', val: string) {
    setAms((prev) => ({ ...prev, [key]: val || undefined }))
  }

  return (
    <GlassCard className={['w-full max-w-none p-6 lg:p-8', AMBER_RING, INNER_GLOW].join(' ')}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT: Viewer (6/12) */}
        <div className="lg:col-span-6 min-w-0">
          <div className={['rounded-xl overflow-hidden bg-black/10', AMBER_RING, INNER_GLOW].join(' ')}>
            <div className="aspect-square w-full">
              <ModelViewer src={modelUrl} />
            </div>
          </div>
        </div>

        {/* RIGHT: Controls (6/12) */}
        <div className="lg:col-span-6 min-w-0 space-y-6">
          {/* Dimensions */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Dimensions (mm)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['height', 'width', 'length'] as const).map((dim) => (
                <div key={dim} className="space-y-1">
                  <label className="text-[11px] opacity-70">{dim.toUpperCase()}</label>
                  <input
                    type="number"
                    min={50}
                    max={256}
                    value={form[dim]}
                    onChange={(e) => setForm((f) => ({ ...f, [dim]: +e.target.value }))}
                    className="w-full rounded-md border border-black/15 dark:border-white/15 p-2 text-sm dark:bg-zinc-800"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Filament Type */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Filament Type</h3>
            <select
              value={form.filamentType}
              onChange={(e) => setForm((f) => ({ ...f, filamentType: e.target.value }))}
              className="w-full rounded-md border border-black/15 dark:border-white/15 p-2 text-sm dark:bg-zinc-800"
            >
              <option value="">Select filament</option>
              {filaments
                .map((f) => f.type)
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
            </select>
          </section>

          {/* AMS Picker */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">AMS Filament Picker (up to 4 colors)</h3>

            <AmsTray
              slots={amsSlots}
              onSlotClick={(slot) => {
                const id = `ams-select-${slot}`
                document.getElementById(id)?.focus()
              }}
            />

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((n) => {
                const key = (`s${n}` as unknown) as 's1' | 's2' | 's3' | 's4'
                return (
                  <div
                    key={n}
                    className={['rounded-xl p-3 bg-white/70 dark:bg-white/10 backdrop-blur-xl', AMBER_RING, INNER_GLOW].join(' ')}
                  >
                    <label
                      htmlFor={`ams-select-${n}`}
                      className="block text-xs font-medium opacity-70 mb-1"
                    >
                      Slot {n}
                    </label>
                    <select
                      id={`ams-select-${n}`}
                      className="w-full rounded-md border border-black/15 dark:border-white/15 bg-white/80 dark:bg-zinc-800 p-2 text-sm"
                      value={(ams as any)[key] || ''}
                      onChange={(e) => updateSlot(key, e.target.value)}
                      disabled={loadingFilaments}
                    >
                      <option value="">— Empty —</option>
                      {filaments.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.type} · {f.color}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Custom Text */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Custom Text</h3>
            <input
              type="text"
              value={form.customText}
              maxLength={100}
              onChange={(e) => setForm((f) => ({ ...f, customText: e.target.value }))}
              className="w-full rounded-md border border-black/15 dark:border-white/15 p-2 text-sm dark:bg-zinc-800"
            />
          </section>

          {/* Speed Selector */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Print Speed</h3>
            <div className="flex flex-wrap gap-4">
              {(['standard', 'quality', 'elite'] as const).map((speed) => (
                <label key={speed} className="text-xs flex items-center gap-2">
                  <input
                    type="radio"
                    name="speed"
                    checked={form.speed === speed}
                    onChange={() => setForm((f) => ({ ...f, speed }))}
                  />
                  {speed.charAt(0).toUpperCase() + speed.slice(1)}
                </label>
              ))}
            </div>
          </section>

          {/* Summary */}
          <section className="pt-2 text-xs opacity-70">
            Selected: {form.height}×{form.width}×{form.length}mm,{' '}
            {form.filamentType || '—'}, {form.colors.length} color(s), speed: {form.speed}
          </section>
        </div>
      </div>
    </GlassCard>
  )
}
