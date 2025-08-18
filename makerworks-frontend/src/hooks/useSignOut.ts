// src/hooks/useSignOut.ts
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import axiosInstance from '@/api/client'
import { toast } from 'sonner'

/** Best-effort backend sign-out + local store cleanup. Never throws. */
export async function signOut(): Promise<void> {
  try {
    await axiosInstance.post('api/v1/auth/signout', null, {
      validateStatus: (s) => (s >= 200 && s < 300) || (s >= 400 && s < 500),
      withCredentials: true,
    })
  } catch {
    // network error? fine — still clear client state below
  } finally {
    try {
      await useAuthStore.getState().logout()
    } catch {
      // ignore
    }
  }
}

/** Hook wrapper with disabled state + navigation. */
export function useSignOut() {
  const [disabled, setDisabled] = useState(false)
  const navigate = useNavigate()

  const doSignOut = async () => {
    if (disabled) return
    setDisabled(true)
    try {
      await signOut() // never throws
      toast.success('Signed out.')
    } finally {
      setDisabled(false)
      navigate('/auth/signin?signedout=1', { replace: true })
    }
  }

  return { disabled, signOut: doSignOut }
}

export default useSignOut
