// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  // Scan index.html and everything in src for class usage (TS/JS + React)
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],

  // Toggle dark mode via the 'dark' class on <html> or <body>
  darkMode: 'class',

  theme: {
    extend: {
      colors: {
        'brand-primary': '#76B900',
        'brand-secondary': '#000000',
        'brand-accent': '#FFFFFF',
        'brand-highlight': '#94E400',
      },
      // boxShadow: { vision: '0 4px 30px rgba(0,0,0,0.1)' },
    },
  },

  // Keep plugins empty unless you’ve actually installed them
  // (forms/typography/aspect-ratio etc.)
  plugins: [],
} satisfies Config
