import React from 'react'

export type Filament = {
  id: string
  name: string
  brand?: string
  material?: string // e.g., PLA, PETG
  color_hex?: string // e.g., "#FFAA00"
}

export type AmsSlot = {
  slot: 1 | 2 | 3 | 4
  filament?: Filament | null
}

type AmsTrayProps = {
  slots: AmsSlot[] // must contain slots 1..4 (order doesn’t matter)
  onSlotClick?: (slot: AmsSlot) => void
  showLabels?: boolean
  size?: 'sm' | 'md' | 'lg'
}

function textOn(hex?: string) {
  // Fallback to dark text if unknown.
  if (!hex) return '#0a0a0a'
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  // Relative luminance (WCAG-ish)
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return L > 0.58 ? '#0a0a0a' : '#ffffff'
}

export default function AmsTray({
  slots,
  onSlotClick,
  showLabels = true,
  size = 'md',
}: AmsTrayProps) {
  const ordered = [...slots].sort((a, b) => a.slot - b.slot)

  const dims =
    size === 'lg'
      ? 'h-24 rounded-2xl'
      : size === 'sm'
      ? 'h-14 rounded-lg'
      : 'h-18 rounded-xl'

  const pill =
    'inline-flex items-center justify-center rounded-full border border-white/30 px-2.5 py-0.5 text-[10px] font-medium backdrop-blur'

  return (
    <div
      className={[
        'w-full select-none rounded-2xl border',
        'border-black/10 dark:border-white/10',
        'bg-white/70 dark:bg-white/10',
        'backdrop-blur-xl p-3',
      ].join(' ')}
      role="group"
      aria-label="AMS tray preview"
    >
      <div className="grid grid-cols-4 gap-3">
        {ordered.map((s) => {
          const color = s.filament?.color_hex || '#D1D5DB' // gray-300 fallback
          const fg = textOn(color)
          const label = s.filament?.material || '—'
          const name = s.filament?.name || 'Empty'

          return (
            <button
              key={s.slot}
              type="button"
              aria-label={`AMS slot ${s.slot}: ${name}`}
              onClick={() => onSlotClick?.(s)}
              className={[
                'relative overflow-hidden',
                'border border-black/10 dark:border-white/10',
                dims,
                'shadow-sm transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-400/60',
              ].join(' ')}
              style={{
                background:
                  `linear-gradient( to bottom, ${color} 0%, ${color} 60%, rgba(0,0,0,0.08) 100% )`,
              }}
            >
              {/* slot number tag */}
              <span
                className={pill}
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  color: fg,
                  backgroundColor: 'rgba(255,255,255,0.35)',
                }}
              >
                S{s.slot}
              </span>

              {/* material pill */}
              {showLabels && (
                <span
                  className={pill}
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    color: fg,
                    backgroundColor: 'rgba(0,0,0,0.25)',
                  }}
                >
                  {label}
                </span>
              )}

              {/* empty indicator */}
              {!s.filament && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ color: fg }}
                >
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
