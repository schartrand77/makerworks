// src/hooks/useSignUp.ts

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axiosInstance from '@/api/client'
import axios, { AxiosError } from 'axios'
import { useAuthStore } from '@/store/useAuthStore'
import { UserOut } from '@/types/auth'

type UseSignUpResult = {
  email: string
  setEmail: (v: string) => void
  username: string
  setUsername: (v: string) => void
  password: string
  setPassword: (v: string) => void
  loading: boolean
  error: string | null
  handleSubmit: (e: React.FormEvent) => void
}

type SignupRequest = {
  email: string
  username: string
  password: string
}

type SignupResponse = {
  user: UserOut
}

export const useSignUp = (): UseSignUpResult => {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedEmail = email.trim()
    const trimmedUsername = username.trim()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedUsername || !trimmedPassword) {
      setError('All fields are required.')
      return
    }

    setLoading(true)

    const payload: SignupRequest = {
      email: trimmedEmail,
      username: trimmedUsername,
      password: trimmedPassword
    }

    console.debug('[useSignUp] Payload sent to backend:', payload)

    try {
      const res = await axiosInstance.post<SignupResponse>('/auth/signup', payload)

      console.debug('[useSignUp] Response:', res)

      const { user } = res.data

      if (!user) {
        throw new Error('Invalid response: missing user')
      }

      useAuthStore.getState().setAuth({ user })

      console.info('[useSignUp] ✅ User registered & state updated:', user)

      navigate('/dashboard')
    } catch (err) {
      console.error('[useSignUp] Signup error:', err)

      let message = 'Signup failed. Please try again.'

      if (axios.isAxiosError(err)) {
        const axErr = err as AxiosError<{ detail?: string | Array<any> }>
        const detail = axErr.response?.data?.detail

        console.error('[useSignUp] Server response detail:', detail)

        if (Array.isArray(detail)) {
          message = detail
            .map((e: { loc?: string[]; msg?: string }) =>
              e.loc && e.msg ? `${e.loc.join('.')}: ${e.msg}` : ''
            )
            .filter(Boolean)
            .join('; ')
        } else if (typeof detail === 'string') {
          message = detail
        } else if (axErr.response?.status) {
          message = `Error ${axErr.response.status}: ${axErr.response.statusText}`
        }
      } else if (err instanceof Error) {
        message = err.message
      }

      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return {
    email,
    setEmail,
    username,
    setUsername,
    password,
    setPassword,
    loading,
    error,
    handleSubmit
  }
}
