import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DevModeState {
  enabled: boolean
  enable: () => void
  disable: () => void
  toggle: () => void
}

export const useDevModeStore = create<DevModeState>()(
  persist(
    (set, get) => ({
      enabled: false,
      enable: () => set({ enabled: true }),
      disable: () => set({ enabled: false }),
      toggle: () => set({ enabled: !get().enabled }),
    }),
    { name: 'dev-mode' }
  )
)
