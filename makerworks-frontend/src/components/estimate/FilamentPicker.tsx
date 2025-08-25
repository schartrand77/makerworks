import React, { useEffect, useMemo, useState } from 'react'
import axios from '@/api/client'
import AmsTray, { AmsSlot, Filament } from './AmsTray'
import { toast } from 'sonner'

type Props = {
  // Called whenever any slot changes (IDs only, easy to POST)
  onChange?: (payload: { s1?: string; s2?: string; s3?: string; s4?: string }) => void
  // Optional initial values (IDs)
  initial?: { s1?: string; s2?: string; s3?: string; s4?: string }
  // If your printer doesn’t have AMS, just render slot 1 picker.
  slots?: 1 | 4
}

export default function FilamentPickerWithAms({
  onChange,
  initial,
  slots = 4,
}: Props) {
  const [all, setAll] = useState<Filament[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<{ s1?: string; s2?: string; s3?: string; s4?: string }>(
    () => ({ ...initial })
  )

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        setLoading(true)
        const { data } = await axios.get('/filaments')
        if (!cancel) {
          setAll(Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [])
        }
      } catch {
        toast.error('Failed to load filaments')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => {
      cancel = true
    }
  }, [])

  const mapById = useMemo(() => {
    const m = new Map<string, Filament>()
    for (const f of all) if (f?.id) m.set(String(f.id), f)
    return m
  }, [all])

  const slotsData: AmsSlot[] = useMemo(() => {
    const s: AmsSlot[] = [
      { slot: 1, filament: sel.s1 ? mapById.get(String(sel.s1)) || undefined : undefined },
    ]
    if (slots === 4) {
      s.push(
        { slot: 2, filament: sel.s2 ? mapById.get(String(sel.s2)) || undefined : undefined },
        { slot: 3, filament: sel.s3 ? mapById.get(String(sel.s3)) || undefined : undefined },
        { slot: 4, filament: sel.s4 ? mapById.get(String(sel.s4)) || undefined : undefined },
      )
    }
    return s
  }, [mapById, sel, slots])

  function updateSlot(key: 's1' | 's2' | 's3' | 's4', val: string) {
    setSel((prev) => {
      const next = { ...prev, [key]: val || undefined }
      onChange?.(next)
      return next
    })
  }

  const option = (f: Filament) => (
    <option key={f.id} value={f.id}>
      {f.material || '—'} · {f.brand ? `${f.brand} ` : ''}{f.name}
    </option>
  )

  return (
    <div className="space-y-3">
      <AmsTray slots={slotsData} onSlotClick={(s) => {
        // Focus the matching select on click for convenience
        const id = `ams-select-${s.slot}`
        document.getElementById(id)?.focus()
      }} />

      <div
        className={[
          'grid gap-3',
          slots === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1',
        ].join(' ')}
      >
        {/* Slot 1 */}
        <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/10 backdrop-blur-xl p-3">
          <label htmlFor="ams-select-1" className="block text-xs font-medium opacity-70 mb-1">
            Slot 1
          </label>
          <select
            id="ams-select-1"
            className="w-full rounded-md border border-black/15 dark:border-white/15 bg-white/80 dark:bg-white/10 p-2 text-sm"
            value={sel.s1 || ''}
            onChange={(e) => updateSlot('s1', e.target.value)}
            disabled={loading}
          >
            <option value="">— Empty —</option>
            {all.map(option)}
          </select>
        </div>

        {/* Slot 2..4 only if AMS */}
        {slots === 4 && (
          <>
            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/10 backdrop-blur-xl p-3">
              <label htmlFor="ams-select-2" className="block text-xs font-medium opacity-70 mb-1">
                Slot 2
              </label>
              <select
                id="ams-select-2"
                className="w-full rounded-md border border-black/15 dark:border-white/15 bg-white/80 dark:bg-white/10 p-2 text-sm"
                value={sel.s2 || ''}
                onChange={(e) => updateSlot('s2', e.target.value)}
                disabled={loading}
              >
                <option value="">— Empty —</option>
                {all.map(option)}
              </select>
            </div>

            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/10 backdrop-blur-xl p-3">
              <label htmlFor="ams-select-3" className="block text-xs font-medium opacity-70 mb-1">
                Slot 3
              </label>
              <select
                id="ams-select-3"
                className="w-full rounded-md border border-black/15 dark:border-white/15 bg-white/80 dark:bg-white/10 p-2 text-sm"
                value={sel.s3 || ''}
                onChange={(e) => updateSlot('s3', e.target.value)}
                disabled={loading}
              >
                <option value="">— Empty —</option>
                {all.map(option)}
              </select>
            </div>

            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/10 backdrop-blur-xl p-3">
              <label htmlFor="ams-select-4" className="block text-xs font-medium opacity-70 mb-1">
                Slot 4
              </label>
              <select
                id="ams-select-4"
                className="w-full rounded-md border border-black/15 dark:border-white/15 bg-white/80 dark:bg-white/10 p-2 text-sm"
                value={sel.s4 || ''}
                onChange={(e) => updateSlot('s4', e.target.value)}
                disabled={loading}
              >
                <option value="">— Empty —</option>
                {all.map(option)}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
