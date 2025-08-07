import React from 'react';
import clsx from 'clsx';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'uploadBlue';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}

const variants = {
  primary:
    'bg-gradient-to-r from-brand-primary to-brand-accent text-black hover:opacity-90',
  secondary:
    'bg-zinc-200/80 text-black dark:bg-zinc-700/70 dark:text-white hover:bg-zinc-300 dark:hover:bg-zinc-600',
  ghost:
    'bg-transparent text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100/40 dark:hover:bg-zinc-700/40',
  danger:
    'bg-red-500/80 text-white dark:bg-red-600/80 hover:bg-red-600 dark:hover:bg-red-700',
  uploadBlue:
    'bg-blue-100/30 text-blue-700 border border-blue-200/40 backdrop-blur hover:bg-blue-100/50 hover:text-blue-800',
};

const sizes = {
  sm: 'px-3 py-1 text-sm rounded-md',
  md: 'px-4 py-2 text-base rounded-lg',
  lg: 'px-6 py-3 text-lg rounded-xl',
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
