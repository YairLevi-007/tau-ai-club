import { Check, Clock, X } from "lucide-react";
import type { GroupState } from "@/lib/pair/match";
import { cn } from "@/components/pair/site-ui";

/**
 * A small rounded label. Tone carries meaning in words too (never colour alone). The site has no
 * green or amber, so pAIr's lime "met" is solid purple and its amber "waiting" is a dashed outline.
 */
export function PairChip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "accent" | "ok" | "warn" | "danger";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.8125rem] leading-tight font-medium",
        tone === "neutral" && "border-border bg-surface text-fg-muted",
        tone === "accent" && "border-border-accent bg-brand-purple/10 text-brand-purple-soft",
        tone === "ok" && "border-brand-purple bg-brand-purple text-on-purple",
        tone === "warn" && "border-border-strong border-dashed bg-bg-deep text-fg-muted",
        tone === "danger" && "border-destructive/50 bg-destructive/10 text-destructive",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The state of one conversation in a published round, as pAIr showed it. */
export function GroupStateChip({ state, manual, labels }: { state: GroupState; manual: boolean; labels: Record<GroupState, string> & { manual: string } }) {
  if (state === "met")
    return (
      <PairChip tone="ok">
        <Check aria-hidden className="size-3.5" />
        {labels.met}
        {manual && ` ${labels.manual}`}
      </PairChip>
    );
  if (state === "missed")
    return (
      <PairChip tone="danger">
        <X aria-hidden className="size-3.5" />
        {labels.missed}
      </PairChip>
    );
  return (
    <PairChip tone="warn">
      <Clock aria-hidden className="size-3.5" />
      {state === "partial" ? labels.partial : labels.pending}
    </PairChip>
  );
}

/** Things in common, as accent chips. */
export function CommonChips({ items, label }: { items: string[]; label?: React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm">
      {label && <span className="text-fg-subtle">{label}</span>}
      {items.map((x) => (
        <PairChip key={x} tone="accent">
          <bdi>{x}</bdi>
        </PairChip>
      ))}
    </p>
  );
}

/** "01", "02"… the pAIr section and pair numbers. */
export function PairNum({ n }: { n: number }) {
  return (
    <span aria-hidden className="font-mono text-sm font-bold text-brand-purple-soft">
      {String(n).padStart(2, "0")}
    </span>
  );
}
