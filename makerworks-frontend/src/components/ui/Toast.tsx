import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'

interface ToastProps {
  message: string
  type?: 'info' | 'success' | 'error'
  show: boolean
  onClose?: () => void
}

export default function Toast({ message, type = 'info', show, onClose }: ToastProps) {
  const bgClass = clsx(
    'toast-info', // fallback
    {
      'toast-success': type === 'success',
      'toast-error': type === 'error',
      'toast-info': type === 'info',
    }
  )

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
          className={bgClass}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
