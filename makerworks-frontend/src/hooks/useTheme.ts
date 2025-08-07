import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

function getPreferredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const saved = localStorage.getItem('theme') as Theme | null
  if (saved) return saved
  return 'system'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getPreferredTheme())

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    if (theme === 'light') root.classList.add('light')
    if (theme === 'dark') root.classList.add('dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'dark') return 'light'
      if (prev === 'light') return 'dark'
      // system: toggle based on current preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      return prefersDark ? 'light' : 'dark'
    })
  }

  return { theme, setTheme, toggleTheme }
}

