// src/components/ui/PageHeader.tsx

import { ReactNode } from 'react';

interface PageHeaderProps {
  icon: ReactNode;
  title: string;
}

export default function PageHeader({ icon, title }: PageHeaderProps) {
  return (
    <h1 className="text-4xl font-bold flex items-center gap-2 text-zinc-400 tracking-tight drop-shadow">
      <span className="w-8 h-8 text-zinc-400">{icon}</span>
      {title}
    </h1>
  );
}
