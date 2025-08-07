// src/components/settings/ThemeSection.tsx

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const THEME_KEY = 'makerworks-theme'

type ThemeOption = 'light' | 'dark' | 'system'

export default function ThemeSection() {
  const [selected, setSelected] = useState<ThemeOption>('system')

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as ThemeOption | null
    if (stored) {
      setSelected(stored)
      applyTheme(stored)
    }
  }, [])

  const applyTheme = (theme: ThemeOption) => {
    const html = document.documentElement
    if (theme === 'dark') {
      html.classList.add('dark')
    } else if (theme === 'light') {
      html.classList.remove('dark')
    } else {
      // system
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        html.classList.add('dark')
      } else {
        html.classList.remove('dark')
      }
    }
  }

  const handleChange = (theme: ThemeOption) => {
    setSelected(theme)
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
    toast.success(`🌗 Theme set to ${theme}`)
  }

  return (
    <div className="space-y-6 text-sm text-gray-800 dark:text-gray-200">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Choose how MakerWorks looks on your device.
      </p>
      <div className="flex gap-4">
        {(['system', 'light', 'dark'] as ThemeOption[]).map((option) => (
          <button
            key={option}
            onClick={() => handleChange(option)}
            className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all backdrop-blur-md border shadow-sm
              ${
                selected === option
                  ? 'bg-blue-600/90 border-blue-500 text-white'
                  : 'bg-blue-400/10 border-white/20 text-gray-200 hover:border-white/40'
              }`}
          >
            {option === 'system' ? '🖥️ System' : option === 'light' ? '🌞 Light' : '🌙 Dark'}
          </button>
        ))}
      </div>
    </div>
  )
}
