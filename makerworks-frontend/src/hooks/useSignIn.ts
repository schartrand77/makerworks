// src/hooks/useSignIn.ts
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import axios from '@/api/axios'
import { useAuthStore } from '@/store/useAuthStore'

interface SignInResponse {
  token: string
  user: {
    id: string
    email: string
    username: string
    avatar_url?: string | null
    role: string
  }
}

export const useSignIn = () => {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const signIn = async (emailOrUsername: string, password: string) => {
    setLoading(true)
    try {
      // ✅ Always hit the correct API route
      const res = await axios.post<SignInResponse>('/auth/signin', {
        email_or_username: emailOrUsername,
        password
      })

      const { token, user } = res.data
      if (!token || !user) throw new Error('Invalid response from server')

      // ✅ Update Zustand + persist auth state
      const { setAuth, fetchUser } = useAuthStore.getState()
      setAuth({ token, user })

      // Ensure avatar and other profile details are loaded
      try {
        await fetchUser(true)
      } catch (err) {
        console.warn('[useSignIn] Failed to fetch full profile:', err)
      }

      toast.success(`Welcome back, ${user.username}!`)

      // ✅ Allow Zustand to flush before navigating to protected route
      await new Promise((resolve) => setTimeout(resolve, 50))

      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      console.error('[useSignIn] Login failed:', err)
      toast.error(err.response?.data?.detail || 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return { signIn, loading }
}
