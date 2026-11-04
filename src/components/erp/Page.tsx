import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b bg-surface px-4 py-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-[22px] font-semibold leading-7 tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClass,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cn("rounded-md border bg-surface shadow-card", className)}>
      {(title || actions) && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-4 py-2.5 sm:flex sm:justify-between">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-[15px] font-semibold text-foreground">{title}</h2>
            )}
            {description && <p className="text-[12px] text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-4 p-4 sm:p-6", className)}>{children}</div>;
}
