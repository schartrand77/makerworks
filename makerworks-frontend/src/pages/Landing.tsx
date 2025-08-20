// src/pages/Landing.tsx
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useEffect, useState } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'

const SPIN_DELAY_MS = 800;        // small grace so slower devices settle; tweak as you like
const SPIN_DUR_MS = 1200;         // one revolution duration (ms)

const Landing = () => {
  const navigate = useNavigate()
  const { isAuthenticated, resolved } = useAuthStore()
  const [hydrated, setHydrated] = useState(false)

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
      <GlassCard>
        <div className="relative w-full h-full px-4 sm:px-6">
          <div className="flex flex-col items-center justify-center text-center p-8">
            <h1 className="text-4xl font-bold mb-6 text-gray-900 dark:text-white leading-tight">
              <span>MakerW</span>
              {/* Spinning gear */}
              <span
                className="inline-block align-baseline gear"
                aria-hidden="true"
                style={{
                  animationDelay: `${SPIN_DELAY_MS}ms`,
                  animationDuration: `${SPIN_DUR_MS}ms`,
                }}
              >
                ⚙️
              </span>
              <span>rks</span>
            </h1>

            <GlassButton
              onClick={() => navigate('/auth/signin')}
              variant="brand"
              size="lg"
              className="px-8 font-medium shadow-lg dark:text-white"
            >
              Enter Site
            </GlassButton>
          </div>
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
            /* tuck letters toward the gear */
            margin: 0 -0.12em; /* adjust between -0.08em and -0.16em to taste */
          }
          @keyframes mw-gear-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }

          /* Respect reduced-motion */
          @media (prefers-reduced-motion: reduce) {
            .gear { animation: none !important; }
          }
        `}
      </style>
    </div>
  )
}

export default Landing
