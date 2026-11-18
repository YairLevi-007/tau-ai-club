// Shared form styles for member and admin pages (plain strings, importable from server and client components).
export const inputClass =
  "h-10 min-w-0 rounded-md border border-border bg-bg-deep/60 px-3 text-[0.9375rem] text-fg transition-colors duration-150 placeholder:text-fg-faint hover:border-border-strong focus-visible:border-brand-purple disabled:cursor-not-allowed disabled:opacity-50";
export const fileInputClass =
  "block w-full min-w-0 max-w-full text-sm text-fg-muted file:me-3 file:h-10 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-surface-hover file:px-3 file:text-sm file:font-semibold file:text-fg hover:file:border-border-strong";
export const smallBtn = "btn btn-ghost h-10 px-3 text-sm";
export const dangerBtn = "btn btn-ghost h-10 px-3 text-sm text-destructive hover:border-destructive/60";
export const labelClass = "grid gap-1.5 text-sm font-medium text-fg-muted";
export const hintClass = "text-xs leading-relaxed text-fg-subtle";
/** A flat surface for grouping a form or a list (admin is denser than the public pages, but the same material). */
export const panelClass = "rounded-lg border border-border bg-surface";
/** Section heading inside a panel. */
export const panelTitle = "text-lg font-bold text-fg";
