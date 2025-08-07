import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { ReactNode } from 'react'

type GlassDrawerProps = {
  isOpen: boolean
  onClose?: () => void
  side?: 'left' | 'right'
  children: ReactNode
  className?: string
}

const animationVariants = {
  right: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
  },
  left: {
    initial: { x: '-100%' },
    animate: { x: 0 },
    exit: { x: '-100%' },
  },
}

export default function GlassDrawer({
  isOpen,
  onClose,
  side = 'right',
  children,
  className = '',
}: GlassDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const variants = animationVariants[side]

  // ESC key → onClose
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        console.debug('[GlassDrawer] ESC pressed → closing')
        onClose?.()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKey)
    }
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          ref={drawerRef}
          className={clsx(
            'fixed top-0 bottom-0 z-[999] w-[320px] sm:w-[400px] shadow-lg backdrop-blur-lg bg-white/80 dark:bg-zinc-900/70 border-l border-white/20 dark:border-zinc-700/30',
            side === 'right' ? 'right-0' : 'left-0',
            className
          )}
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.exit}
          transition={{ type: 'tween', duration: 0.3 }}
          role="complementary"
        >
          <div className="h-full overflow-y-auto p-6">
            {children}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
