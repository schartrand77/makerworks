// src/components/ui/Toast.tsx — makerworks
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react'

interface ToastProps {
  message: string
  type?: 'info' | 'success' | 'error'
  show: boolean
  onClose?: () => void
}

/**
 * Styled to match the app:
 * - Grey glass card (light: bg-white/60, dark: bg-white/10)
 * - Amber/red-orange ring + glossy hover
 * - Status accent (icon + slim left bar). Ring stays amber per system.
 * - Click anywhere to dismiss (still supports onClose)
 *
 * Positioning is left to the caller/container; this is just the toast itself.
 */
export default function Toast({
  message,
  type = 'info',
  show,
  onClose,
}: ToastProps) {
  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertTriangle : Info

  const accentBar = clsx(
    'absolute inset-y-0 left-0 w-1 rounded-l-2xl',
    {
      'bg-amber-400/80': type === 'info',
      'bg-emerald-400/85': type === 'success',
      'bg-red-500/85': type === 'error',
    }
  )

  const iconWrap = clsx(
    'shrink-0 rounded-full p-1.5',
    {
      'text-amber-400 bg-amber-500/12': type === 'info',
      'text-emerald-400 bg-emerald-500/12': type === 'success',
      'text-red-400 bg-red-500/12': type === 'error',
    }
  )

  const shell = clsx(
    // exact grey-glass + amber rim like the cards
    'relative overflow-visible rounded-2xl mw-card',
    'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
    'border border-amber-300/45 ring-1 ring-amber-300/40 hover:ring-amber-400/55',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
    'before:content-[""] before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none',
    'before:opacity-0 hover:before:opacity-100 before:transition-opacity',
    'before:shadow-[0_0_0_1px_rgba(251,146,60,0.12),0_0_12px_rgba(251,146,60,0.10),0_0_20px_rgba(251,146,60,0.08)]',
    // layout/typography
    'px-4 py-3 flex items-center gap-3 text-sm text-zinc-900 dark:text-zinc-100',
    'cursor-pointer select-none'
  )

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          onClick={onClose}
          className={shell}
          title="Click to dismiss"
        >
          <span className={accentBar} aria-hidden />
          <span className={iconWrap} aria-hidden>
            <Icon className="w-4 h-4" />
          </span>
          <div className="pr-2">{message}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
