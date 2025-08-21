import { useEffect, useCallback, ElementType, KeyboardEvent } from 'react';
import { Outlet, Link } from 'react-router-dom';
import clsx from 'clsx';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageLayoutProps {
  title?: string;
  children?: React.ReactNode;
  center?: boolean;
  as?: ElementType;
  elevation?: 'none' | 'md' | 'lg';
  padding?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  description?: string;
  id?: string;
  onClose?: () => void;
  breadcrumbs?: Breadcrumb[];
}

export default function PageLayout({
  title,
  children,
  center = true,
  as: Component = 'div',
  elevation = 'md',
  padding = 'p-6',
  maxWidth = 'lg',
  description,
  id,
  onClose,
  breadcrumbs,
}: PageLayoutProps) {
  useEffect(() => {
    if (title) document.title = `${title} | MakerWorks`;
  }, [title]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape' && onClose) onClose();
    },
    [onClose]
  );

  const shadow =
    elevation === 'none'
      ? ''
      : elevation === 'lg'
      ? 'shadow-2xl'
      : 'shadow-xl';

  const width =
    maxWidth === 'full'
      ? 'max-w-full'
      : maxWidth === 'xl'
      ? 'max-w-6xl'
      : maxWidth === 'lg'
      ? 'max-w-4xl'
      : maxWidth === 'md'
      ? 'max-w-2xl'
      : 'max-w-xl';

  return (
    <div className="w-full min-h-screen flex flex-col text-zinc-900 dark:text-white">
      <div
        className="w-full flex-1 px-4 py-8 flex justify-center items-center"
        aria-describedby={description ? `${id}-description` : undefined}
      >
        <Component
          id={id}
          role="region"
          aria-label={title}
          onKeyDown={handleKeyDown}
          tabIndex={-1}
          className={clsx(
            'w-full',
            width,
            padding,
            'rounded-3xl glass-card',
            shadow,
            'transition-all outline-none',
            center &&
              'flex flex-col items-center justify-center text-center space-y-6'
          )}
        >
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav
              className="text-sm text-zinc-600 dark:text-zinc-400 mb-2 space-x-1"
              aria-label="Breadcrumb"
            >
              {breadcrumbs.map((crumb, idx) => (
                <span key={idx}>
                  {crumb.href ? (
                    <Link
                      to={crumb.href}
                      className="hover:underline hover:text-brand-orange"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-zinc-800 dark:text-white">
                      {crumb.label}
                    </span>
                  )}
                  {idx < breadcrumbs.length - 1 && (
                    <span className="mx-1">/</span>
                  )}
                </span>
              ))}
            </nav>
          )}

          {title && (
            <h1
              className="text-3xl font-bold tracking-tight"
              id={`${id}-title`}
            >
              {title}
            </h1>
          )}

          {description && (
            <p
              className="text-zinc-500 text-sm max-w-prose"
              id={`${id}-description`}
            >
              {description}
            </p>
          )}

          <div className="w-full">{children ?? <Outlet />}</div>
        </Component>
      </div>
    </div>
  );
}
