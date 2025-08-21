import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import axios from '@/api/client'
import { useAuthStore } from '@/store/useAuthStore'
import GlassButton from '@/components/ui/GlassButton'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const theme = localStorage.getItem('theme')
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const handleLogin = async () => {
    if (!usernameOrEmail || !password) {
      toast.error('❌ Username/email and password are required')
      return
    }

    setLoading(true)
    try {
      const response = await axios.post('/auth/signin', {
        email_or_username: usernameOrEmail,
        password,
      })

      const { user } = response.data
      setAuth({ user })

      if (user.avatar_url) {
        try {
          localStorage.setItem('avatar_url', user.avatar_url)
        } catch {}
      }

      toast.success('✅ Login successful')
      navigate('/dashboard')
    } catch (err: any) {
      console.error('[Login Error]', err)
      toast.error(
        err?.response?.data?.detail || '❌ Login failed. Check credentials.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto mt-12">
      <input
        type="text"
        placeholder="Username or Email"
        value={usernameOrEmail}
        onChange={(e) => setUsernameOrEmail(e.target.value)}
        onKeyDown={handleKeyPress}
        className="border rounded px-3 py-2 bg-white/10 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={handleKeyPress}
        className="border rounded px-3 py-2 bg-white/10 text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange"
      />
        <GlassButton
          onClick={handleLogin}
          disabled={loading}
          variant="brand"
          className="py-2 text-black rounded"
        >
          {loading ? 'Logging in…' : 'Login'}
        </GlassButton>
    </div>
  )
}
