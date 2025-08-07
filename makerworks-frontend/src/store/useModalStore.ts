// src/store/useModalStore.ts
import { create } from 'zustand'
import type { ReactNode } from 'react'

export type ModalType = 'example' | 'upload' | 'settings' | 'cart' | 'signin'

type Modal = {
  id: string
  component: ReactNode
  type: ModalType
  props?: Record<string, unknown>
}

type ModalState = {
  modals: Modal[]
  openModal: (modal: Modal) => void
  closeModal: () => void
  clearModals: () => void
}

export const useModalStore = create<ModalState>((set) => ({
  modals: [],
  openModal: (modal) =>
    set((state) => ({ modals: [...state.modals, modal] })),
  closeModal: () =>
    set((state) => ({ modals: state.modals.slice(0, -1) })),
  clearModals: () => set({ modals: [] }),
}))
