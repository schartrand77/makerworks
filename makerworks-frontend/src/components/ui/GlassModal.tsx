import { useEffect, useRef, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'

const portalRoot =
  typeof document !== 'undefined'
    ? document.getElementById('modal-root') || document.body
    : null

const sizeClasses: Record<GlassModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
}

const animationPresets: Record<GlassModalAnimation, any> = {
  center: {
    initial: { y: 40, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: 20, opacity: 0 },
  },
  'bottom-sheet': {
    initial: { y: '100%', opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0 },
  },
  'side-drawer': {
    initial: { x: '100%', opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: '100%', opacity: 0 },
  },
}

type GlassModalSize = 'sm' | 'md' | 'lg' | 'xl'
type GlassModalAnimation = 'center' | 'bottom-sheet' | 'side-drawer'

interface GlassModalProps {
  isOpen: boolean
  onClose?: () => void
  title?: string
  description?: string
  id?: string
  size?: GlassModalSize
  animation?: GlassModalAnimation
  children: ReactNode
  className?: string
}

export default function GlassModal({
  isOpen,
  onClose,
  title,
  description,
  id = 'glass-modal',
  size = 'md',
  animation = 'center',
  children,
  className = '',
}: GlassModalProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        console.debug('[GlassModal] ESC pressed → closing')
        onClose?.()
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      console.debug('[GlassModal] Clicked outside → closing')
      onClose?.()
    }
  }

  const motionProps = animationPresets[animation] || animationPresets.center

  const modal = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          onClick={handleOverlayClick}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            aria-describedby={description ? `${id}-description` : undefined}
            id={id}
            className={clsx(
              'w-full mx-4 bg-white/80 dark:bg-zinc-800/70 border border-white/30 dark:border-zinc-700/30 backdrop-blur-lg shadow-xl rounded-3xl p-6',
              sizeClasses[size],
              className
            )}
            {...motionProps}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {title && (
              <h2 id={`${id}-title`} className="text-xl font-semibold mb-3 text-center">
                {title}
              </h2>
            )}
            {description && (
              <p
                id={`${id}-description`}
                className="text-sm text-zinc-600 dark:text-zinc-300 mb-4 text-center"
              >
                {description}
              </p>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return portalRoot ? createPortal(modal, portalRoot) : null
}
