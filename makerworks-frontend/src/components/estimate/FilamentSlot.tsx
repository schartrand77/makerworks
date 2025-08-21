import React from 'react'
import { bgClassFromHex, fillClassFromHex } from '@/lib/colorMap'

interface FilamentSlotProps {
  hex: string
  active: boolean
  onClick: () => void
}

export default function FilamentSlot({ hex, active, onClick }: FilamentSlotProps) {
  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <button
        type="button"
        onClick={onClick}
        className={`w-8 h-8 flex items-center justify-center rounded-full relative transition-transform hover:scale-105 ${bgClassFromHex(hex)} ${
          active ? 'ring-2 ring-black dark:ring-white' : ''
        }`}
        title={hex}
      >
        <svg
          viewBox="0 0 24 24"
          stroke={active ? '#000' : '#fff'}
          strokeWidth="1"
          className={`w-5 h-5 transition-transform ${fillClassFromHex(hex)} ${
            active ? 'animate-pulse' : ''
          }`}
        >
          <path d="M12 2 C14 8, 20 10, 12 22 C4 10, 10 8, 12 2 Z" />
        </svg>
      </button>

      {active && (
        <div
          className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-3 w-16 h-3 rounded-full blur-md opacity-70 pointer-events-none animate-glow ${bgClassFromHex(hex)}`}
        />
      )}
    </div>
  )
}
