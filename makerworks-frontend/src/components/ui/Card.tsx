// src/components/ui/Card.tsx
import React from 'react'
import clsx from 'clsx'

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'plain' | 'glass' | 'glass-amber'
}

const Card: React.FC<CardProps> = ({ variant = 'glass-amber', className, ...props }) => {
  const base = 'relative overflow-visible rounded-2xl w-full'

  const look =
    variant === 'glass-amber'
      ? [
          'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
          'border border-amber-300/45 ring-1 ring-amber-300/40 hover:ring-amber-400/55',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
        ].join(' ')
      : variant === 'glass'
      ? 'bg-white/60 dark:bg-white/10 backdrop-blur-xl border border-white/12'
      : 'bg-transparent'

  return <div className={clsx(base, look, className)} {...props} />
}

export default Card
export { Card }
