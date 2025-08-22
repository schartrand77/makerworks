// src/pages/Landing.tsx
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useEffect, useMemo, useState } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'

const SPIN_DELAY_MS = 800
const SPIN_DUR_MS = 1200
const MOTTO = ['dream.', 'design.', 'deliver.']

function useAppVersion() {
  const [version, setVersion] = useState<string>('')

  // Prefer build-time env (if set), else call API
  const envVersion =
    (import.meta.env as any)?.VITE_APP_VERSION &&
    String((import.meta.env as any).VITE_APP_VERSION).trim()

  const apiUrl = useMemo(() => {
    const base = (import.meta.env as any)?.VITE_API_BASE
      ? String((import.meta.env as any).VITE_API_BASE).replace(/\/+$/, '')
      : ''
    const path = '/api/v1/system/version'
    return base ? `${base}${path}` : path
  }, [])

  useEffect(() => {
    if (envVersion) {
      setVersion(envVersion)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl, { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json().catch(() => ({}))
        const v =
          (data?.version && String(data.version)) ||
          (data?.app_version && String(data.app_version)) ||
          (data?.tag && String(data.tag)) ||
          ''
        if (!cancelled) setVersion(v)
      } catch (err) {
        console.debug('[Landing] version fetch failed:', err)
        if (!cancelled) setVersion('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [envVersion, apiUrl])

  return version
}

/** Tiny theme toggle: persists to localStorage('theme') and toggles `dark` on <html> */
function useTheme() {
  const getInitial = () => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null
    if (saved === 'dark') return true
    if (saved === 'light') return false
    return typeof window !== 'undefined'
      ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  }
  const [isDark, setIsDark] = useState<boolean>(getInitial)

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  return { isDark, toggle: () => setIsDark(v => !v) }
}

const Landing = () => {
  const navigate = useNavigate()
  const { isAuthenticated, resolved } = useAuthStore()
  const [hydrated, setHydrated] = useState(false)
  const version = useAppVersion()
  const { isDark, toggle } = useTheme()

  // motto staged reveal
  const [mottoIdx, setMottoIdx] = useState<number>(-1)
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setMottoIdx(MOTTO.length - 1)
      return
    }
    const d0 = 280
    const step = 520
    const tids = [
      setTimeout(() => setMottoIdx(0), d0),
      setTimeout(() => setMottoIdx(1), d0 + step),
      setTimeout(() => setMottoIdx(2), d0 + step * 2),
    ]
    return () => tids.forEach(clearTimeout)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setHydrated(true), 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (hydrated && resolved && isAuthenticated()) {
      navigate('/dashboard', { replace: true })
    }
  }, [hydrated, resolved, isAuthenticated, navigate])

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-white dark:bg-brand-black">
      {/* Fixed-size card to prevent stretch/squish */}
      <GlassCard className="mw-card mw-card--fixed">
        <div className="relative w-full h-full px-4 sm:px-6">
          {/* 6-row grid: top | title+motto | spacer | button | version | bottom */}
          <div className="mw-grid grid grid-rows-[1.2fr_auto_32px_auto_auto_.8fr] place-items-center h-full p-8 text-center gap-0">
            {/* Row 2: Title + Motto (stays put) */}
            <div className="row-start-2 flex flex-col items-center justify-end">
              <h1 className="mw-title text-4xl font-bold text-gray-900 dark:text-white leading-tight">
                <span>MakerW</span>
                <span
                  className="inline-block align-baseline gear"
                  aria-hidden="true"
                  style={{ animationDelay: `${SPIN_DELAY_MS}ms`, animationDuration: `${SPIN_DUR_MS}ms` }}
                >
                  ⚙️
                </span>
                <span>rks</span>
              </h1>

              {/* Motto smaller, between title and button */}
              <div className="mw-motto mt-2 flex items-center justify-center gap-2 select-none" aria-hidden="true">
                {MOTTO.map((w, i) => (
                  <span key={w} className={`mw-motto-word ${i <= mottoIdx ? 'is-on' : ''}`}>{w}</span>
                ))}
              </div>
            </div>

            {/* Row 3: (empty spacer) handled by grid */}

            {/* Row 4: Button (pushed down) */}
            <GlassButton
              onClick={() => navigate('/auth/signin')}
              variant="brand"
              size="lg"
              className="row-start-4 mw-enter mw-enter--slim rounded-full font-medium shadow-lg text-gray-800 dark:text-gray-200 transition-all duration-200 block mx-auto"
            >
              Enter
            </GlassButton>

            {/* Row 5: Version under button */}
            {version ? (
              <div className="row-start-5 mt-3 text-[11px] tracking-tight text-gray-600 dark:text-gray-300">
                v{version}
              </div>
            ) : (
              <div className="row-start-5 mt-3 h-[12px] w-[42px] rounded opacity-40 bg-gray-300 dark:bg-gray-600" />
            )}
          </div>

          {/* Bottom-right tiny theme toggle pinned to corner */}
          <button
            type="button"
            aria-label="Toggle theme"
            title="Toggle theme"
            onClick={toggle}
            className="mw-theme-toggle mw-theme-toggle--nano"
            data-dark={isDark ? 'true' : 'false'}
          >
            <span className="mw-toggle-thumb" aria-hidden />
          </button>
        </div>
      </GlassCard>

      <style>
        {`
          .gear {
            transform-origin: 50% 50%;
            animation-name: mw-gear-spin;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
            will-change: transform;
            margin: 0 -0.12em;
          }
          @keyframes mw-gear-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) { .gear { animation: none !important; } }

          /* ----- Card sizing: stop the stretch/squish ----- */
          .mw-card--fixed {
            width: clamp(280px, 92vw, 520px);
            height: clamp(380px, 56vh, 520px);
          }

          /* --- LED green token --- */
          .mw-enter { --mw-ring: #16a34a; }

          /* --- Slim, modern pill sizing --- */
          .mw-enter--slim {
            padding: 0.56rem 1.95rem !important;
            font-size: 0.95rem !important;
            line-height: 1.2 !important;
            letter-spacing: 0.01em;
          }

          /* --- Base LED ring look --- */
          .mw-enter {
            background: transparent !important;
            border: 1px solid var(--mw-ring) !important;
            box-shadow:
              inset 0 0 8px 1.5px rgba(22,163,74,0.36),
              0 0 10px 2.5px rgba(22,163,74,0.34);
          }
          .mw-enter:hover {
            background: transparent !important;
            box-shadow:
              inset 0 0 12px 2.5px rgba(22,163,74,0.58),
              0 0 16px 5px rgba(22,163,74,0.60),
              0 0 32px 12px rgba(22,163,74,0.24);
          }
          .mw-enter:focus-visible {
            outline: none !important;
            box-shadow:
              inset 0 0 13px 2.5px rgba(22,163,74,0.58),
              0 0 0 2px rgba(255,255,255,0.6),
              0 0 0 4px var(--mw-ring),
              0 0 20px 5px rgba(22,163,74,0.48);
          }

          /* --- Card + hover glow --- */
          .mw-card { transition: box-shadow 180ms ease; position: relative; isolation: isolate; border-radius: inherit; }
          .mw-card:has(.mw-enter:hover) {
            box-shadow:
              0 0 0 1px rgba(22,163,74,0.38),
              0 0 26px 10px rgba(22,163,74,0.34),
              0 0 56px 24px rgba(22,163,74,0.20);
          }

          /* --- Warm glow behind the title when button hovers --- */
          .mw-title { position: relative; transition: text-shadow 180ms ease; z-index: 0; }
          .mw-title::after {
            content: ""; position: absolute; inset: -18% -20%;
            background: radial-gradient(60% 60% at 50% 50%, rgba(255, 186, 88, 0.46) 0%, rgba(255, 186, 88, 0.34) 45%, rgba(255, 186, 88, 0.00) 75%);
            filter: blur(22px); opacity: 0; transition: opacity 180ms ease; z-index: -1; pointer-events: none;
          }
          .mw-card:has(.mw-enter:hover) .mw-title {
            text-shadow: 0 0 18px rgba(255, 186, 88, 0.60), 0 0 42px rgba(255, 186, 88, 0.46), 0 0 70px rgba(255, 186, 88, 0.34);
          }
          .mw-card:has(.mw-enter:hover) .mw-title::after { opacity: 1; }

          /* ===== Tiny Theme Toggle (BOTTOM-RIGHT) ===== */
          .mw-theme-toggle {
            --mw-ring: #16a34a;
            position: absolute; right: 6px; bottom: 6px; z-index: 40;
            user-select: none; -webkit-tap-highlight-color: transparent;
            border-radius: 9999px; border: 1px solid var(--mw-ring);
            background: rgba(0,0,0,0.03);
            display: inline-flex; align-items: center; justify-content: center;
            transition: box-shadow 160ms ease, background-color 160ms ease, transform 120ms ease;
            box-shadow: inset 0 0 3px 1px rgba(22,163,74,0.25), 0 0 4px 1px rgba(22,163,74,0.22);
          }
          .mw-theme-toggle--nano { width: 32px; height: 18px; padding: 0; }
          .mw-theme-toggle:hover {
            box-shadow: inset 0 0 5px 2px rgba(22,163,74,0.45), 0 0 8px 2px rgba(22,163,74,0.40);
            background: rgba(0,0,0,0.06);
          }
          .mw-theme-toggle .mw-toggle-thumb {
            position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; border-radius: 9999px; background: #ffffff;
            box-shadow: inset 0 0 4px 1px rgba(22,163,74,0.35), 0 0 6px 1.5px rgba(22,163,74,0.35);
            transition: transform 180ms ease, background-color 160ms ease;
          }
          .mw-theme-toggle[data-dark="true"] .mw-toggle-thumb { transform: translateX(14px); background: #0f172a; }
          .dark .mw-theme-toggle { background: rgba(255,255,255,0.05); }

          /* ===== Depth + outline ring for DARK MODE card ===== */
          .dark .mw-card {
            box-shadow:
              0 0 0 1px rgba(255,255,255,0.10),
              inset 0 1px 0 rgba(255,255,255,0.08),
              inset 0 -1px 0 rgba(0,0,0,0.55),
              0 12px 36px rgba(0,0,0,0.55);
            background-image:
              radial-gradient(120% 80% at 50% -10%, rgba(255,255,255,0.07), rgba(255,255,255,0.00) 55%),
              linear-gradient(180deg, rgba(255,255,255,0.035), rgba(0,0,0,0.0) 40%, rgba(0,0,0,0.16));
            background-clip: padding-box;
          }
          .dark .mw-card::before {
            content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
            box-shadow: 0 0 0 1px rgba(22,163,74,0.12) inset; z-index: 0;
          }

          /* ===== Motto (smaller, above button) ===== */
          .mw-motto { font-size: 0.9rem; color: #4b5563; }
          .dark .mw-motto { color: rgba(229,231,235,0.85); }
          .mw-motto-word {
            position: relative; opacity: 0; transform: translateY(6px) scale(0.98); filter: blur(2px);
            transition: opacity 280ms ease, transform 280ms ease, filter 280ms ease; will-change: opacity, transform, filter;
          }
          .mw-motto-word.is-on {
            opacity: 1; transform: translateY(0) scale(1); filter: blur(0);
            text-shadow: 0 0 12px rgba(22,163,74,0.52), 0 0 26px rgba(22,163,74,0.32);
          }
          .mw-motto-word::after {
            content: ""; position: absolute; left: 14%; right: 14%; bottom: -3px; height: 2px; border-radius: 2px;
            background: rgba(22,163,74,0.82); filter: blur(3.5px); opacity: 0; transition: opacity 240ms ease;
          }
          .mw-motto-word.is-on::after { opacity: 1; }
        `}
      </style>
    </div>
  )
}

export default Landing
