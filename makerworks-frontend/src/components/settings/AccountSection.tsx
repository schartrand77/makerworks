// src/components/settings/AccountSection.tsx

import { useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { toast } from 'sonner'
import axios from '@/api/client'

export default function AccountSection() {
  const { user, logout } = useAuthStore()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    const confirmed = window.confirm('⚠️ This action is irreversible. Delete your account?')
    if (!confirmed) return

    setDeleting(true)
    try {
      await axios.delete(`/users/${user?.id}`)
      toast.success('🗑️ Account deleted')
      logout()
    } catch (err) {
      toast.error('❌ Failed to delete account')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 text-sm text-gray-800 dark:text-gray-200">
      <div className="bg-white/70 dark:bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/20 shadow-inner">
        <p>
          <span className="font-medium text-gray-700 dark:text-gray-300">Email:</span>{' '}
          {user?.email}
        </p>
        <p className="mt-1 text-gray-500 dark:text-gray-400">Password management coming soon.</p>
      </div>

      <div className="pt-4 border-t border-white/10">
        <p className="text-sm text-red-400 mb-2">Danger Zone</p>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-full py-2 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all disabled:opacity-60"
        >
          {deleting ? 'Deleting Account...' : 'Delete My Account'}
        </button>
      </div>
    </div>
  )
}
