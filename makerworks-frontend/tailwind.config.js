/* eslint-env node */
/* global require */
/** @type {import('tailwindcss').Config} */

export default {
  darkMode: 'class',

  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],

  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#FF6A1F',
          secondary: '#121212',
          accent: '#C0C0C0',
          highlight: '#FF6A1F',
        },
        glass: {
          light: 'rgba(255, 255, 255, 0.6)',
          dark: 'rgba(24, 24, 27, 0.6)',
        },
        toast: {
          success: 'rgba(34, 197, 94, 0.8)',
          error: 'rgba(239, 68, 68, 0.8)',
          info: 'rgba(59, 130, 246, 0.8)',
        },
      },

      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },

      borderRadius: {
        '3xl': '1.5rem',
        pill: '9999px',
      },

      boxShadow: {
        glass: '0 8px 32px 0 rgba(31, 38, 135, 0.2)',
        vision: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 2px 12px rgba(0,0,0,0.1)',
      },

      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },

  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),

    function ({ addUtilities, theme, addBase }) {
      // Toast classes
      addUtilities({
        '.toast-success': {
          '@apply text-white px-4 py-2 rounded-xl shadow-lg backdrop-blur-md': {},
          backgroundColor: theme('colors.toast.success'),
        },
        '.toast-error': {
          '@apply text-white px-4 py-2 rounded-xl shadow-lg backdrop-blur-md': {},
          backgroundColor: theme('colors.toast.error'),
        },
        '.toast-info': {
          '@apply text-white px-4 py-2 rounded-xl shadow-lg backdrop-blur-md': {},
          backgroundColor: theme('colors.toast.info'),
        },
      });

      // Global input & textarea styling
      addBase({
        'input, textarea, select': {
          '@apply w-full text-gray-800 placeholder-gray-500 bg-white/90 border border-gray-300 rounded-xl px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-highlight transition': {},
        },
        'input:disabled, textarea:disabled, select:disabled': {
          '@apply opacity-50 cursor-not-allowed': {},
        },
        // Dark mode overrides
        '.dark input, .dark textarea, .dark select': {
          '@apply bg-white/5 text-white placeholder-gray-400 border-white/20': {},
        },
      });
    },
  ],
}
