import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { getStableBackground } from '@/lib/screenBackground';
import { cn } from '@/lib/utils';

export function ScreenBackground({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const location = useLocation();
  const background = getStableBackground(location.pathname);

  return (
    <div className={cn('relative min-h-[calc(100vh-7rem)] overflow-hidden', className)}>
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-[0.14]"
        style={{ backgroundImage: `url(${background})` }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-background/92 backdrop-blur-[1px]" />
      <div className="relative">{children}</div>
    </div>
  );
}
