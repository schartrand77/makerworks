import React from 'react';
import clsx from 'clsx';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?:
    | 'primary'
    | 'secondary'
    | 'ghost'
    | 'danger'
    | 'brand'
    | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  as?: React.ElementType;
  className?: string;
}

const variants = {
  primary:
    'bg-transparent text-brand-orange ring-1 ring-brand-orange/60 hover:ring-brand-orange/80 focus:ring-brand-orange/80',
  secondary:
    'bg-transparent text-zinc-800 dark:text-zinc-200 ring-1 ring-zinc-300/60 dark:ring-zinc-600/60 hover:ring-zinc-300/80 dark:hover:ring-zinc-600/80 focus:ring-zinc-300/80 dark:focus:ring-zinc-600/80',
  ghost:
    'bg-transparent text-zinc-800 dark:text-zinc-200 ring-1 ring-zinc-300/60 dark:ring-zinc-700/60 hover:ring-zinc-300/80 dark:hover:ring-zinc-700/80 focus:ring-zinc-300/80 dark:focus:ring-zinc-700/80',
  danger:
    'bg-transparent text-red-600 dark:text-red-400 ring-1 ring-red-500/60 dark:ring-red-600/60 hover:ring-red-500/80 dark:hover:ring-red-600/80 focus:ring-red-500/80 dark:focus:ring-red-600/80',
  brand:
    'bg-transparent text-brand-black ring-1 ring-brand-orange/60 hover:text-brand-green hover:ring-brand-green focus:ring-brand-green active:ring-brand-green',
  success:
    'bg-transparent text-white ring-1 ring-brand-green hover:ring-brand-green active:ring-brand-green focus:ring-brand-green',
};

const sizes = {
  sm: 'px-3 py-1 text-sm rounded-full',
  md: 'px-4 py-2 text-base rounded-full',
  lg: 'px-6 py-3 text-lg rounded-full',
};

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      loading = false,
      as = 'button',
      className,
      ...props
    },
    ref
  ) => {
    const Component = as as any;

    return (
      <Component
        ref={ref}
        className={clsx(
          'inline-flex justify-center items-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            ></path>
          </svg>
        )}
        {loading ? 'Loading…' : children}
      </Component>
    );
  }
);

GlassButton.displayName = 'GlassButton';

export default GlassButton;
