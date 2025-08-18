// src/hooks/useSignIn.ts
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import axios from '@/api/client'
import { useAuthStore } from '@/store/useAuthStore'

/**
 * The backend now uses cookie-based auth exclusively.
 * Keep this hook compatible with older token responses, and try the payload shape the API expects:
 *   { username_or_email, password }
 * We still gracefully fall back to older shapes (identifier/email/username or OAuth2 form)
 * so we don’t break existing users.
 */

interface SignInResponse {
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
  if (r?.status === 401) return 'Invalid email/username or password.'
  return err?.message ? String(err.message) : 'Sign-in failed'
}

export const useSignIn = () => {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const signIn = async (emailOrUsername: string, password: string) => {
    setLoading(true)
    const ident = (emailOrUsername ?? '').trim()
    const pass = (password ?? '').trim()
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ident)

    if (!ident || !pass) {
      toast.error('Provide email/username and password.')
      setLoading(false)
      return
    }

    // Track attempts to avoid loops
    const tried = new Set<string>()

    try {
      const { setAuth, fetchUser } = useAuthStore.getState()

      // Helpers
      const doJson = (body: Record<string, string>) =>
        axios.post<SignInResponse>('/auth/signin', body, {
          withCredentials: true,
        })

      const doForm = (params: URLSearchParams) =>
        axios.post<SignInResponse>('/auth/signin', params, {
          withCredentials: true,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })

      let res:
        | {
            status: number
            data: SignInResponse
          }
        | undefined

      // 🔑 1) Preferred: { username_or_email, password } (admin & normal users)
      try {
        tried.add('username_or_email')
        res = await doJson({ username_or_email: ident, password: pass })
      } catch (e1: any) {
        // If payload shape was wrong, we’ll adapt; otherwise rethrow
        if (e1?.response?.status !== 422) throw e1

        // 2) Inspect 422 to see what the API wants
        const fields = parse422Fields(e1)

        // Try { identifier, password }
        if (!res && fields.includes('identifier') && !tried.has('identifier')) {
          tried.add('identifier')
          try {
            res = await doJson({ identifier: ident, password: pass })
          } catch (e2: any) {
            if (e2?.response?.status !== 422) throw e2
          }
        }

        // Try { email_or_username, password } (alternate naming we’ve seen)
        if (!res && fields.includes('email_or_username') && !tried.has('email_or_username')) {
          tried.add('email_or_username')
          try {
            res = await doJson({ email_or_username: ident, password: pass })
          } catch (e3: any) {
            if (e3?.response?.status !== 422) throw e3
          }
        }

        // Try classic shapes explicitly if hints weren’t helpful
        if (!res && isEmail && !tried.has('email')) {
          tried.add('email')
          try {
            res = await doJson({ email: ident, password: pass })
          } catch (e4: any) {
            if (e4?.response?.status !== 422) throw e4
          }
        }

        if (!res && !isEmail && !tried.has('username')) {
          tried.add('username')
          try {
            res = await doJson({ username: ident, password: pass })
          } catch (e5: any) {
            if (e5?.response?.status !== 422) throw e5
          }
        }

        // 3) OAuth2 style form (some FastAPI templates support this)
        if (!res && !tried.has('form')) {
          tried.add('form')
          try {
            const form = new URLSearchParams({
              username: ident,
              password: pass,
              grant_type: 'password',
              scope: '',
            })
            res = await doForm(form)
          } catch (e6: any) {
            if (e6?.response?.status !== 422) throw e6
          }
        }

        // 4) Last-ditch: try identifier again (covers username paths)
        if (!res && !tried.has('identifier2')) {
          tried.add('identifier2')
          res = await doJson({ identifier: ident, password: pass })
        }
      }

      if (!res || res.status !== 200) {
        throw new Error('Login failed')
      }

      const data = res.data as SignInResponse | any
      const user = data?.user || (data?.id ? (data as any) : undefined)

      if (user) {
        setAuth({ user })
      } else {
        try {
          await fetchUser(true)
        } catch {
          /* ignore */
        }
      }

      toast.success(`Welcome back, ${user?.username ?? ident}!`)
      // Let state settle before routing
      await new Promise((r) => setTimeout(r, 50))
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      console.error('[useSignIn] Login failed:', err)
      toast.error(stringifyError(err))
    } finally {
      setLoading(false)
    }
  }

  return { signIn, loading }
}

// Keep default export to avoid breaking imports that expect it.
export default useSignIn
