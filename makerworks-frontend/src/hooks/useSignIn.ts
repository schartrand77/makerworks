// src/hooks/useSignIn.ts
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import axios from '@/api/axios'
import { useAuthStore } from '@/store/useAuthStore'

interface SignInResponse {
  token?: string
  user?: {
    id: string
    email: string
    username: string
    avatar_url?: string | null
    role: string
  }
}

function parse422Fields(err: any): string[] {
  const det = err?.response?.data?.detail ?? err?.response?.data?.errors
  if (!Array.isArray(det)) return []
  const out: string[] = []
  for (const e of det) {
    const loc = Array.isArray(e?.loc) ? e.loc : []
    const field = loc[loc.length - 1]
    if (typeof field === 'string') out.push(field)
  }
  return out
}

function stringifyError(err: any): string {
  const r = err?.response
  const d = r?.data
  if (typeof d === 'string') return d
  if (typeof d?.detail === 'string') return d.detail
  const fields = parse422Fields(err)
  if (fields.length) return `Invalid or missing field: ${fields[0]}`
  if (r?.status === 401) return 'Invalid credentials'
  return err?.message ? String(err.message) : 'Sign-in failed'
}

export const useSignIn = () => {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const signIn = async (emailOrUsername: string, password: string) => {
    setLoading(true)
    const ident = emailOrUsername.trim()
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ident)

    // We’ll adapt based on server feedback; keep track to avoid loops
    const tried = new Set<string>()

    try {
      const { setAuth, fetchUser } = useAuthStore.getState()

      // Helper do-post
      const doJson = (body: Record<string, string>) =>
        axios.post<SignInResponse>('/auth/signin', body, { withCredentials: true })
      const doForm = (params: URLSearchParams) =>
        axios.post<SignInResponse>('/auth/signin', params, {
          withCredentials: true,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })

      // 1) First attempt: JSON { email, password } (most common)
      let res
      try {
        tried.add('email')
        res = await doJson({ email: ident, password })
      } catch (e: any) {
        if (e?.response?.status !== 422) throw e
        // 2) Read which field(s) the backend actually wants
        const fields = parse422Fields(e)

        // Prefer exact hint
        if (fields.includes('identifier') && !tried.has('identifier')) {
          tried.add('identifier')
          try {
            res = await doJson({ identifier: ident, password })
          } catch (e2: any) {
            if (e2?.response?.status !== 422) throw e2
            // fallthrough to next
          }
        }

        if (!res && fields.includes('email_or_username') && !tried.has('email_or_username')) {
          tried.add('email_or_username')
          try {
            res = await doJson({ email_or_username: ident, password })
          } catch (e3: any) {
            if (e3?.response?.status !== 422) throw e3
          }
        }

        // If still no luck or hint says "username", try OAuth2 form
        if (!res && (fields.includes('username') || fields.length === 0) && !tried.has('form')) {
          tried.add('form')
          try {
            const form = new URLSearchParams({
              username: ident,
              password,
              grant_type: 'password', // some deps expect this present
              scope: '',
            })
            res = await doForm(form)
          } catch (e4: any) {
            if (e4?.response?.status !== 422) throw e4
          }
        }

        // If they typed a username (not an email), try identifier-path proactively
        if (!res && !isEmail && !tried.has('identifier2')) {
          tried.add('identifier2')
          res = await doJson({ identifier: ident, password })
        }
      }

      if (!res || res.status !== 200) {
        throw new Error('Login failed')
      }

      const { token, user } = res.data || {}

      // JWT-style
      if (token && user) {
        setAuth({ token, user })
      } else {
        // Cookie-session style: hydrate profile
        try {
          await fetchUser(true)
        } catch {
          /* ignore */
        }
      }

      // Navigate after slight delay to let store settle
      toast.success(`Welcome back, ${user?.username ?? ident}!`)
      await new Promise((r) => setTimeout(r, 50))
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      console.error('[useSignIn] Login failed:', err)
      toast.error(stringifyError(err)) // always a string
    } finally {
      setLoading(false)
    }
  }

  return { signIn, loading }
}
