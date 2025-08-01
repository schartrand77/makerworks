'use client'

import { useModalStore } from '@/store/useModalStore'
import { AnimatePresence, motion } from 'framer-motion'
import { type ReactNode } from 'react'

export function ModalProvider({ children }: { children: ReactNode }) {
  const modals = useModalStore((state) => state.modals)

  return (
    <>
      {children}
      <AnimatePresence mode="wait">
        {modals.map((modal) => (
          <motion.div
            key={modal.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
          >
            {modal.component}
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  )
}
