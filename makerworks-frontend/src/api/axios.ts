// src/api/axios.ts
import axios from 'axios'
import { useAuthStore } from '@/store/useAuthStore'

// ✅ Ensure correct base URL and remove the stray comma
const base =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') || 'http://localhost:8000/api/v1'

const instance = axios.create({
  baseURL: base,
  withCredentials: true,
})

instance.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }

    // ✅ Debug log to verify final URL
    console.info(`[axios] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`)
    return config
  },
  (error) => Promise.reject(error)
)

export default instance
