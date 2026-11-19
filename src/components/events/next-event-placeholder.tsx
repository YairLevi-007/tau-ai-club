import { cn } from "@/lib/utils";

/**
 * Holds the members' Next event card's place on the home page while it loads (design review item 5,
 * part 2), so the card arrives without moving anything. Same frame as the card, no shimmer or other
 * motion; a short status line for screen readers and anyone on a slow connection.
 */
export function NextEventPlaceholder({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      data-testid="next-event-placeholder"
      className={cn(
        "relative grid min-h-[37rem] content-start rounded-lg border border-border-accent bg-bg-raised p-5 shadow-[var(--shadow-featured)] [background-image:var(--card-featured-bg)] lg:min-h-[38.75rem] lg:p-7",
        className,
      )}
    >
      <span aria-hidden className="absolute -top-px -start-px size-3.5 rounded-ss-lg border-s-2 border-t-2 border-brand-purple" />
      <span aria-hidden className="absolute -top-px -end-px size-3.5 rounded-se-lg border-e-2 border-t-2 border-brand-purple" />
      <p className="text-sm text-fg-subtle">{label}</p>
      {/* The card's outline in quiet blocks: title, speaker, the date and time tiles. Decorative. */}
      <div aria-hidden className="mt-6 grid gap-3">
        <span className="h-8 w-4/5 rounded-sm bg-surface" />
        <span className="h-8 w-3/5 rounded-sm bg-surface" />
        <span className="mt-4 flex items-center gap-3">
          <span className="size-11 rounded-full bg-surface" />
          <span className="h-4 w-32 rounded-sm bg-surface" />
        </span>
        <span className="mt-4 grid grid-cols-2 gap-2.5">
          <span className="h-20 rounded-md bg-surface" />
          <span className="h-20 rounded-md bg-surface" />
          <span className="col-span-2 h-16 rounded-md bg-surface" />
        </span>
      </div>
    </div>
  );
}

/**
 * Runs inline, before the hero is painted: marks <html> for a browser with the member hint cookie,
 * so the hero's member layout (the card's placeholder, the short faces row on wide screens) is in
 * place at first paint. Layout only; what the card shows is still decided on the server.
 */
export const MEMBER_HINT_SCRIPT = String.raw`if(/(?:^|;\s*)tau_member=1(?:;|$)/.test(document.cookie))document.documentElement.dataset.memberHint="1"`;
