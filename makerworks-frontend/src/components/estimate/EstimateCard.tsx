import { useState, useEffect } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import ModelViewer from '@/components/ui/ModelViewer'
import { fetchAvailableFilaments } from '@/api/filaments'
import { toast } from 'sonner'
import { bgClassFromHex } from '@/lib/colorMap'

interface Filament {
  id: string
  type: string
  color: string
  hex: string
}

interface EstimateForm {
  height: number
  width: number
  length: number
  filamentType: string
  colors: string[]
  customText: string
  speed: 'standard' | 'quality' | 'elite'
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

  useEffect(() => {
    fetchAvailableFilaments()
      .then(setFilaments)
      .catch((err) => {
        console.error('[EstimateCard] Failed to load filaments:', err)
        toast.error('Failed to load filaments')
      })
      .finally(() => setLoadingFilaments(false))
  }, [])

  const handleColorToggle = (hex: string) => {
    setForm((prev) => {
      const colors = prev.colors.includes(hex)
        ? prev.colors.filter((c) => c !== hex)
        : prev.colors.length < 4
          ? [...prev.colors, hex]
          : prev.colors
      return { ...prev, colors }
    })
  }

  return (
    <GlassCard className="p-6 space-y-4">
      <h2 className="text-xl font-semibold mb-4">Estimate Print Job</h2>

      {/* 3D Model */}
      <div className="bg-black/10 rounded-xl overflow-hidden">
        <ModelViewer src={modelUrl} />
      </div>

      {/* Size */}
      <div className="grid grid-cols-3 gap-2">
        {(['height', 'width', 'length'] as const).map((dim) => (
          <div key={dim}>
            <label className="text-xs">{dim.toUpperCase()} (mm)</label>
            <input
              type="number"
              min={50}
              max={256}
              value={form[dim]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [dim]: +e.target.value }))
              }
              className="w-full rounded-md border p-1 text-sm dark:bg-zinc-800"
            />
          </div>
        ))}
      </div>

      {/* Filament Type */}
      <div>
        <label className="text-xs">Filament Type</label>
        <select
          value={form.filamentType}
          onChange={(e) => setForm((f) => ({ ...f, filamentType: e.target.value }))}
          className="w-full rounded-md border p-1 dark:bg-zinc-800 text-sm"
        >
          <option value="">Select filament</option>
          {filaments.map((f) => (
            <option key={f.id} value={f.type}>
              {f.type}
            </option>
          ))}
        </select>
      </div>

      {/* Color Palette */}
      <div>
        <label className="text-xs">Select up to 4 Colors</label>
        <div className="flex flex-wrap gap-1 mt-1">
          {filaments.map((f) => (
            <button
              key={f.hex}
              type="button"
              onClick={() => handleColorToggle(f.hex)}
              className={`w-6 h-6 rounded-full border-2 ${bgClassFromHex(f.hex)} ${
                form.colors.includes(f.hex)
                  ? 'border-black dark:border-white'
                  : 'border-transparent'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Custom Text */}
      <div>
        <label className="text-xs">Custom Text</label>
        <input
          type="text"
          value={form.customText}
          maxLength={100}
          onChange={(e) => setForm((f) => ({ ...f, customText: e.target.value }))}
          className="w-full rounded-md border p-1 text-sm dark:bg-zinc-800"
        />
      </div>

      {/* Speed Selector */}
      <div>
        <label className="text-xs">Print Speed</label>
        <div className="flex gap-2">
          {(['standard', 'quality', 'elite'] as const).map((speed) => (
            <label key={speed} className="text-xs flex items-center gap-1">
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
      </div>

      {/* Summary */}
      <div className="mt-4 text-xs text-zinc-500">
        Selected: {form.height}×{form.width}×{form.length}mm, {form.filamentType}, {form.colors.length} color(s), speed: {form.speed}
      </div>
    </GlassCard>
  )
}
