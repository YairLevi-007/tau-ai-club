import type { ReactNode } from "react";

/** Page header for admin screens: same type scale as the public pages, one notch smaller. */
export function AdminHeader({
  title,
  body,
  meta,
  action,
  alert,
  before,
}: {
  title: ReactNode;
  body?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  alert?: ReactNode;
  before?: ReactNode;
}) {
  return (
    <header className="grid gap-3">
      {before}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="grid min-w-0 gap-2">
          <h1 className="text-[clamp(1.625rem,5vw,2.125rem)] leading-[1.15] font-extrabold text-balance text-fg">{title}</h1>
          {body && <p className="max-w-[65ch] text-fg-muted">{body}</p>}
          {meta && <p className="text-sm text-fg-subtle">{meta}</p>}
        </div>
        {action}
      </div>
      {alert && (
        <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3.5 py-3 text-fg">
          {alert}
        </p>
      )}
    </header>
  );
}
