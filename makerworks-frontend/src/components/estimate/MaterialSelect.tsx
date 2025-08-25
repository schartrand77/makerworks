// src/components/estimate/MaterialSelect.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/api/client'

const MATERIAL_DESCRIPTIONS: Record<string, string> = {
  PLA: 'Easy to print, low warp, great for prototypes & cosplay. Not heat-resistant.',
  PETG: 'Tough with good layer adhesion. Slight flex, more stringing. Better outdoors than PLA.',
  ABS: 'Stronger & heat-resistant. Warps without enclosure. Can be acetone-smoothed.',
  ASA: 'ABS-like but UV-resistant. Great for outdoor parts. Also prefers enclosure.',
  TPU: 'Flexible (≈95A). Slow printing, needs tuning. Great for gaskets & grips.',
  Nylon: 'Very strong & wear-resistant. Hygroscopic (keep dry). Prints hot, likes enclosure.',
  PC: 'Very strong & heat-resistant. Warps, prints hot, enclosure recommended.',
  'PLA-CF': 'PLA + carbon fiber. Stiffer, nicer surface. Abrasive → hardened nozzle.',
  'PETG-CF': 'PETG + carbon fiber. Stiffer, good outdoors. Abrasive → hardened nozzle.',
  _default:
    'General-purpose filament. See vendor datasheet for temps, speeds, and bed requirements.',
}

export default function MaterialSelect(props: {
  value?: string
  onChange?: (material: string) => void
  /** CSS selector for the description box below the viewer (e.g., "#material-desc"). */
  descTarget?: string
  /** Optional className to match your “Filament Type” styling area. */
  className?: string
}) {
  const { value, onChange, descTarget = '#material-desc', className } = props
  const [open, setOpen] = useState(false)
  const [materials, setMaterials] = useState<string[]>([])
  const [sel, setSel] = useState<string>(value || '')
  const [hover, setHover] = useState<string>('')

  const rootRef = useRef<HTMLDivElement>(null)

  // load materials from /filaments
  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const { data } = await axios.get('/filaments')
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
        const s = new Set<string>()
        for (const f of items) {
          const m = (f.material || '').trim()
          if (m) s.add(m)
        }
        if (!cancel) setMaterials(Array.from(s).sort())
      } catch {
        // ignore; UI will just show empty
      }
    })()
    return () => {
      cancel = true
    }
  }, [])

  // outside click closes
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!open) return
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Update description box below viewer on hover/selection
  useEffect(() => {
    const el = descTarget ? (document.querySelector(descTarget) as HTMLElement | null) : null
    if (!el) return
    const key = hover || sel
    el.textContent = key ? (MATERIAL_DESCRIPTIONS[key] || MATERIAL_DESCRIPTIONS._default) : ''
  }, [hover, sel, descTarget])

  // reflect controlled value changes
  useEffect(() => {
    if (value !== undefined) setSel(value)
  }, [value])

  return (
    <div ref={rootRef} className={className}>
      <label className="block text-xs font-medium opacity-70 mb-1">Material</label>
      <button
        type="button"
        className="w-full rounded-md border border-black/15 dark:border-white/15 bg-white/80 dark:bg-white/10 px-3 py-2 text-sm text-left"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {sel || 'Select material'}
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-[min(28rem,100%)] overflow-auto rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 shadow-lg"
          onMouseLeave={() => setHover('')}
        >
          {materials.map((m) => (
            <li
              key={m}
              role="option"
              aria-selected={sel === m}
              className={[
                'px-3 py-2 text-sm cursor-pointer hover:bg-black/5 dark:hover:bg-white/10',
                sel === m ? 'font-medium' : '',
              ].join(' ')}
              onMouseEnter={() => setHover(m)}
              onFocus={() => setHover(m)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setSel(m)
                setOpen(false)
                onChange?.(m)
              }}
            >
              {m}
            </li>
          ))}
          {!materials.length && (
            <li className="px-3 py-2 text-sm opacity-70">(no materials)</li>
          )}
        </ul>
      )}
    </div>
  )
}
