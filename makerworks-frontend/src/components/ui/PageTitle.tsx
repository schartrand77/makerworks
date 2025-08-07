import React from 'react';
import clsx from 'clsx';

interface PageTitleProps {
  icon?: React.ReactNode;
  title: string;
  className?: string;
  withDivider?: boolean;
}

const PageTitle: React.FC<PageTitleProps> = ({
  icon = '📦',
  title,
  className = '',
  withDivider = false,
}) => {
  return (
    <header className={clsx('mb-6', className)}>
      <div className="flex items-center gap-2">
        <div className="text-2xl">{icon}</div>
        <h1
          className={clsx(
            'text-2xl font-semibold tracking-tight',
            'text-zinc-500 dark:text-zinc-400'
          )}
        >
          {title}
        </h1>
      </div>
      {withDivider && (
        <div className="mt-2 h-px bg-zinc-200 dark:bg-zinc-700" />
      )}
    </header>
  );
};

export default PageTitle;
