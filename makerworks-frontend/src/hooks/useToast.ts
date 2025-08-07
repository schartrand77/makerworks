// src/hooks/useToast.ts
import { useContext } from 'react'
import { ToastContext } from '@/context/ToastProvider'

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
