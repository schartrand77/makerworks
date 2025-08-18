// src/hooks/useSignIn.ts
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import axios from '@/api/client'
import { useAuthStore } from '@/store/useAuthStore'

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

      // 🔑 1) Correct for your backend: { email_or_username, password }
      try {
        tried.add('email_or_username')
        res = await doJson({ email_or_username: ident, password: pass })
      } catch (e1: any) {
        // If not a validation error, bail
        if (e1?.response?.status !== 422) throw e1

        // 2) Parse 422 and try alternates the server might accept
        const fields = parse422Fields(e1)

        // Try { username_or_email, password } (legacy variant)
        if (!res && (!fields.length || fields.includes('username_or_email')) && !tried.has('username_or_email')) {
          tried.add('username_or_email')
          try {
            res = await doJson({ username_or_email: ident, password: pass })
          } catch (e2: any) {
            if (e2?.response?.status !== 422) throw e2
          }
        }

        // Try { identifier, password }
        if (!res && fields.includes('identifier') && !tried.has('identifier')) {
          tried.add('identifier')
          try {
            res = await doJson({ identifier: ident, password: pass })
          } catch (e3: any) {
            if (e3?.response?.status !== 422) throw e3
          }
        }

        // Try { email_or_username } without hints (some APIs are… special)
        if (!res && !tried.has('email_or_username_retry')) {
          tried.add('email_or_username_retry')
          try {
            res = await doJson({ email_or_username: ident, password: pass })
          } catch (e4: any) {
            if (e4?.response?.status !== 422) throw e4
          }
        }

        // Classic shapes explicitly if nothing worked
        if (!res && isEmail && !tried.has('email')) {
          tried.add('email')
          try {
            res = await doJson({ email: ident, password: pass })
          } catch (e5: any) {
            if (e5?.response?.status !== 422) throw e5
          }
        }

        if (!res && !isEmail && !tried.has('username')) {
          tried.add('username')
          try {
            res = await doJson({ username: ident, password: pass })
          } catch (e6: any) {
            if (e6?.response?.status !== 422) throw e6
          }
        }

        // OAuth2 password flow form as a last resort
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
          } catch (e7: any) {
            if (e7?.response?.status !== 422) throw e7
          }
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

export default useSignIn
