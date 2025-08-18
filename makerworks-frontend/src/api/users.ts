import axios from './client'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAuthStore } from '@/store/useAuthStore'
import { getCurrentUser } from './auth'
import { isAxiosError } from 'axios'

export interface AvatarUploadResponse {
  status: 'ok'
  avatar_url: string
  thumbnail_url: string
  uploaded_at: string
}

export const UpdateProfileSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  bio: z.string().max(140).optional(),
  language: z.string().optional()
})

export type UpdateProfilePayload = z.infer<typeof UpdateProfileSchema>

/**
 * Upload a new avatar for the current user.
 */
export const uploadAvatar = async (
  file: File
): Promise<AvatarUploadResponse | null> => {
  const { user, setUser, fetchUser } = useAuthStore.getState()
  if (!user?.id) {
    toast.error('❌ Not authenticated. Please log in.')
    return null
  }

  const formData = new FormData()
  formData.append('file', file)

  try {
    const res = await axios.post<AvatarUploadResponse>(
      `/avatar`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    // Patch the current user with the new avatar URL
    setUser({
      ...user,
      avatar_url: res.data.avatar_url
    })

    try {
      await fetchUser(true)
    } catch (err) {
      console.warn('[uploadAvatar] Failed to refresh user:', err)
    }

    toast.success('✅ Avatar updated.')
    return res.data
  } catch (err: unknown) {
    console.error('[uploadAvatar] error', err)
    const detail =
      isAxiosError(err) && err.response?.data?.detail
        ? String(err.response.data.detail)
        : '❌ Failed to upload avatar.'
    toast.error(detail)
    return null
  }
}

/**
 * Update the current user's profile (username, email, bio, etc.)
 */
export const updateUserProfile = async (
  data: UpdateProfilePayload
): Promise<void> => {
  const { user } = useAuthStore.getState()
  if (!user) {
    toast.error('❌ Not authenticated. Please log in.')
    throw new Error('Not authenticated')
  }

  const parsed = UpdateProfileSchema.safeParse(data)
  if (!parsed.success) {
    toast.error('❌ Invalid profile data.')
    console.error(parsed.error)
    throw parsed.error
  }

  try {
    await axios.patch('/users/me', parsed.data)

    // Refetch updated profile to hydrate state
    await getCurrentUser()

    toast.success('✅ Profile updated.')
  } catch (err: unknown) {
    console.error('[updateUserProfile] error', err)
    const detail =
      isAxiosError(err) && err.response?.data?.detail
        ? String(err.response.data.detail)
        : '❌ Failed to update profile.'
    toast.error(detail)
    throw err
  }
}

/**
 * Delete the current user's account.
 */
export const deleteAccount = async (): Promise<void> => {
  const { user, logout } = useAuthStore.getState()
  if (!user) {
    toast.error('❌ Not authenticated. Please log in.')
    throw new Error('Not authenticated')
  }

  try {
    await axios.delete('/users/me')
    logout()
    toast.success('✅ Account deleted.')
  } catch (err: unknown) {
    console.error('[deleteAccount] error', err)
    const detail =
      isAxiosError(err) && err.response?.data?.detail
        ? String(err.response.data.detail)
        : '❌ Failed to delete account.'
    toast.error(detail)
    throw err
  }
}
