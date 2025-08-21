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
        'brand-white': '#FFFFFF',
        'brand-black': '#000000',
        'brand-orange': '#FF7A1A',
        'brand-green': '#42FFA1',
        'brand-text': '#2B2D31',
      },
      // boxShadow: { vision: '0 4px 30px rgba(0,0,0,0.1)' },
    },
  },

  // Keep plugins empty unless you’ve actually installed them
  // (forms/typography/aspect-ratio etc.)
  plugins: [],
} satisfies Config
