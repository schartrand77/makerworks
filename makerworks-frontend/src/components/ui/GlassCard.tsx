import { ElementType, ReactNode, ComponentPropsWithoutRef } from 'react';
import clsx from 'clsx';

type Elevation = 'none' | 'md' | 'lg';
type MaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const elevationClasses: Record<Elevation, string> = {
  none: '',
  md: 'shadow-md',
  lg: 'shadow-lg',
};

const maxWidthClasses: Record<MaxWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

interface GlassCardProps<T extends ElementType = 'div'> {
  as?: T;
  children: ReactNode;
  className?: string;
  elevation?: Elevation;
  padding?: string;
  maxWidth?: MaxWidth;
  glow?: boolean;
  id?: string;
}

/**
 * Liquid Glass card component with configurable options.
 */
export default function GlassCard<T extends ElementType = 'div'>({
  as,
  children,
  className = '',
  elevation = 'md',
  padding = 'p-6',
  maxWidth = 'lg',
  glow = true,
  id,
  ...props
}: GlassCardProps<T> & ComponentPropsWithoutRef<T>) {
  const Component = as || 'div';

  const glowClass = glow
    ? 'shadow-[0_8px_20px_rgba(128,128,128,0.15)]'
    : '';

  return (
    <Component
      id={id}
      className={clsx(
        'glass-card',
        'backdrop-blur-sm',
        'bg-white/20 dark:bg-black/20',
        'rounded-xl',
        'border border-white/10 dark:border-black/20',
        'transition',
        'duration-300',
        elevationClasses[elevation],
        maxWidthClasses[maxWidth],
        padding,
        glowClass,
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
