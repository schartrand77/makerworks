// src/components/ui/Card.tsx  (aka Card.tsx — makerworks)
import React from 'react'
import clsx from 'clsx'

/**
 * MakerWorks Card
 * Exact same shell as Cart/Dashboard:
 * - grey glass background (light: bg-white/60, dark: bg-white/10)
 * - amber/red-orange ring + glossy top highlight
 * - mw-led so the card halos green only when a .mw-enter button inside is hovered
 *
 * NOTE: This intentionally avoids `bg-card` so dark theme doesn't stomp the grey.
 */
export const Card: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { className?: string }
> = ({ className, ...props }) => {
  return (
    <div
      className={clsx(
        // shell
        'relative overflow-visible rounded-2xl mw-led mw-card',
        'bg-white/60 dark:bg-white/10 backdrop-blur-xl',
        'border border-amber-300/45 ring-1 ring-amber-300/40 hover:ring-amber-400/55',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
        // glossy top & ring glow on hover
        'before:content-[""] before:absolute before:inset-0 before:rounded-2xl before:pointer-events-none',
        'before:opacity-0 hover:before:opacity-100 before:transition-opacity',
        'before:shadow-[0_0_0_1px_rgba(251,146,60,0.12),0_0_12px_rgba(251,146,60,0.10),0_0_20px_rgba(251,146,60,0.08)]',
        // readable text by default
        'text-zinc-900 dark:text-zinc-100',
        className
      )}
      {...props}
    />
  )
}

export const CardContent: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { className?: string }
> = ({ className, ...props }) => {
  return <div className={clsx('p-4', className)} {...props} />
}
