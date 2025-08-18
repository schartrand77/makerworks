// src/components/settings/ProfileSection.tsx

import { useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/useAuthStore'
import axios from '@/api/client'

export default function ProfileSection() {
  const { user, setUser } = useAuthStore()
  const [username, setUsername] = useState(user?.username ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await axios.patch('/users/me', {
        username,
        email,
        bio
      })
      setUser(res.data)
      toast.success('✅ Profile updated')
    } catch (err) {
      toast.error('❌ Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle =
    'w-full rounded-xl px-4 py-2 bg-white/90 text-gray-800 placeholder-gray-500 border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 transition dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/20'

  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
          Username
        </label>
        <input
          type="text"
          className={inputStyle}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
          Email
        </label>
        <input
          type="email"
          className={inputStyle}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
          Bio (140 characters)
        </label>
        <textarea
          maxLength={140}
          rows={3}
          className={inputStyle}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="mt-4 px-6 py-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white transition-all disabled:opacity-60"
      >
        {loading ? 'Saving…' : 'Save Profile'}
      </button>
    </div>
  )
}
