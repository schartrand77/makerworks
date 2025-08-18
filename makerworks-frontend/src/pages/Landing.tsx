// src/pages/Landing.tsx
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useEffect, useState } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'

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
        <div className="flex flex-col items-center justify-center text-center p-8">
          <h1 className="text-4xl font-bold mb-6">MakerW⚙️rks</h1>
          <GlassButton
            onClick={() => navigate('/auth/signin')}
            variant="brand"
            size="lg"
            className="px-8 font-medium shadow-lg"
          >
            Enter Site
          </GlassButton>
        </div>
      </GlassCard>
    </div>
  )
}

export default Landing


