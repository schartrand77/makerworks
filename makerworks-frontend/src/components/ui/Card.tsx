import React from 'react'
import clsx from 'clsx'

export const Card: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { className?: string }
> = ({ className, ...props }) => {
  return (
    <div
      className={clsx(
        'rounded-lg border bg-card text-card-foreground shadow-sm',
        className
      )}
      {...props}
    />
  )
}

export const CardContent: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { className?: string }
> = ({ className, ...props }) => {
  return (
    <div className={clsx('p-4', className)} {...props} />
  )
}
