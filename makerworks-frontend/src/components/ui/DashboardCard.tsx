import { Link } from 'react-router-dom'
import { ReactNode } from 'react'
import clsx from 'clsx'
import GlassCard from './GlassCard'

interface DashboardCardProps {
  title: string
  description: string
  icon?: ReactNode
  to: string
  className?: string
}

export default function DashboardCard({
  title,
  description,
  icon,
  to,
  className,
}: DashboardCardProps) {
  return (
    <GlassCard
      as={Link}
      to={to}
      className={clsx(
        'flex items-start gap-4 no-underline shadow-[0_8px_20px_rgba(128,128,128,0.15)]',
        className
      )}
    >
      {icon && <div className="text-xl" aria-hidden>{icon}</div>}
      <div>
        <h3 className="text-lg font-semibold mb-1">{title}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      </div>
    </GlassCard>
  )
}
