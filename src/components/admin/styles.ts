// Shared form styles for member and admin pages (plain strings, importable from server and client components).
export const inputClass =
  "h-10 min-w-0 rounded-md border border-border bg-bg-deep/60 px-3 text-[0.9375rem] text-fg transition-colors duration-150 placeholder:text-fg-faint hover:border-border-strong focus-visible:border-brand-purple disabled:cursor-not-allowed disabled:opacity-50";
export const smallBtn = "btn btn-ghost h-10 px-3 text-sm";
export const dangerBtn = "btn btn-ghost h-10 px-3 text-sm text-destructive hover:border-destructive/60";
export const labelClass = "grid gap-1.5 text-sm font-medium text-fg-muted";
export const hintClass = "text-xs leading-relaxed text-fg-subtle";
/**
 * A surface for grouping a form or a list in admin. Since 19.11 the same purple raised material as
 * the rest of the site (DECISIONS: the whole site looks like the personal area; round 2, item 11).
 * Admin stays denser through its spacing, not a different card.
 */
export const panelClass = "rounded-lg border border-brand-purple/40 bg-bg-raised";
/** Option 3 (user, 18.11): the purple raised card used on the home page and in the personal area. */
export const raisedPanelClass = "rounded-lg border border-brand-purple/40 bg-bg-raised";
/** Section heading inside a panel. */
export const panelTitle = "text-lg font-bold text-fg";
