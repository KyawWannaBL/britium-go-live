import { ReactNode } from 'react';

export function PortalBanner({
  image,
  title,
  subtitle,
  children,
}: {
  image: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl border bg-cover bg-center p-8"
      style={{ backgroundImage: `linear-gradient(rgba(255,255,255,.82), rgba(255,255,255,.90)), url(${image})` }}
    >
      <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
        </div>
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
