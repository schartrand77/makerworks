// src/lib/colorMap.ts
// Utility to map arbitrary filament hex colors to the nearest brand palette token
// and provide Tailwind-ready class names. Unknown or invalid hex values fall back
// to a neutral gray so that non-brand colors don't clash with UI brand colors.

// Tailwind safelist: these classes are referenced dynamically via the helpers below.
// bg-brand-red bg-brand-blue bg-brand-black bg-brand-white bg-brand-text bg-zinc-400
// fill-brand-red fill-brand-blue fill-brand-black fill-brand-white fill-brand-text fill-zinc-400

const palette = [
  { token: 'brand-red', hex: '#FF4F00' },
  { token: 'brand-blue', hex: '#003366' },
  { token: 'brand-black', hex: '#000000' },
  { token: 'brand-white', hex: '#FFFFFF' },
  { token: 'brand-text', hex: '#333333' },
] as const

const fallbackToken = 'zinc-400'

function normalizeHex(input: string): string | null {
  let hex = (input || '').toString().trim().toLowerCase()
  if (!hex) return null
  if (!hex.startsWith('#')) hex = `#${hex}`
  if (/^#([0-9a-f]{3})$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  }
  return /^#([0-9a-f]{6})$/.test(hex) ? hex : null
}

function hexToRgb(hex: string) {
  const num = parseInt(hex.slice(1), 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

function distance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2
}

export function mapHexToToken(hex: string): string {
  const norm = normalizeHex(hex)
  if (!norm) return fallbackToken
  const rgb = hexToRgb(norm)
  let best = fallbackToken
  let bestDist = Number.POSITIVE_INFINITY
  for (const p of palette) {
    const d = distance(rgb, hexToRgb(p.hex))
    if (d < bestDist) {
      best = p.token
      bestDist = d
    }
  }
  return best
}

export function bgClassFromHex(hex: string) {
  return `bg-${mapHexToToken(hex)}`
}

export function fillClassFromHex(hex: string) {
  return `fill-${mapHexToToken(hex)}`
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _tw = ['bg-brand-red','bg-brand-blue','bg-brand-black','bg-brand-white','bg-brand-text','bg-zinc-400','fill-brand-red','fill-brand-blue','fill-brand-black','fill-brand-white','fill-brand-text','fill-zinc-400']
void _tw
