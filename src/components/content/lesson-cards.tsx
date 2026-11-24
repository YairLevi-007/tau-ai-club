import { ArrowLeft, ArrowRight, ListChecks } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import type { SeasonEvent } from "@/lib/data/types";
import { markdownToText } from "@/lib/content/markdown";
import type { ContentRow } from "@/lib/content/sections";
import { formatEventDate, isoAttr, loc } from "@/lib/event-format";
import { Tag } from "@/components/events/event-bits";
import { SpeakerList, contentCardClass } from "@/components/content/content-bits";
import { BidiText } from "@/components/events/bidi-text";
import { cn } from "@/lib/utils";

// The lecture and workshop cards of the "שיעורים / Lessons" page (24.11). Same markup as the
// old /lectures and /workshops lists, so they look the way they did.

type Labels = { past: string; upcoming: string; next: string; happeningNow: string };

export function LectureCard({
  event: e,
  locale: l,
  blurb,
  labels,
}: {
  event: SeasonEvent;
  locale: Locale;
  blurb: Pick<ContentRow, "body_he" | "body_en"> | undefined;
  labels: Labels & { summaryComing: string; readLecture: string };
}) {
  const title = loc(e, "title", l) ?? e.slug;
  const blurbText = blurb ? markdownToText((l === "en" ? blurb.body_en : null) || blurb.body_he) : null;
  const Forward = l === "he" ? ArrowLeft : ArrowRight;
  return (
    <article className={cn(contentCardClass(e.state), "h-full content-start")} data-testid="lecture-card">
      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
        <time dateTime={isoAttr(e.starts_at)}>{formatEventDate(e.starts_at, l)}</time>
        {e.state === "past" ? <Tag>{labels.past}</Tag> : <Tag tone={e.state === "next" || e.state === "live" ? "next" : "neutral"}>{labels.upcoming}</Tag>}
      </div>
      <h3 className="text-xl font-bold text-balance text-fg sm:text-2xl">
        <Link href={`/lectures/${e.slug}`} className="rounded-sm after:absolute after:inset-0 after:rounded-lg">
          <BidiText text={title} />
        </Link>
      </h3>
      <SpeakerList event={e} locale={l} size={44} />
      {blurbText ? (
        <p className="line-clamp-3 max-w-[68ch] text-fg-muted" lang={l === "en" && !blurb?.body_en ? "he" : undefined}>
          {blurbText}
        </p>
      ) : (
        <p className="text-sm text-fg-subtle">{labels.summaryComing}</p>
      )}
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-purple-soft" aria-hidden>
        {labels.readLecture}
        <Forward className="size-4" />
      </span>
    </article>
  );
}

export function WorkshopCard({
  event: w,
  locale: l,
  numberLabel,
  prepReady,
  labels,
}: {
  event: SeasonEvent;
  locale: Locale;
  /** "Workshop 2 of 3", already formatted. */
  numberLabel: string;
  prepReady: boolean;
  labels: Labels & { prepReady: string; open: string };
}) {
  const Forward = l === "he" ? ArrowLeft : ArrowRight;
  return (
    <article className={cn(contentCardClass(w.state), "h-full content-start gap-3")} data-testid="workshop-card">
      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
        <span>{numberLabel}</span>
        {w.state === "past" && <Tag>{labels.past}</Tag>}
        {(w.state === "next" || w.state === "live") && <Tag tone="next">{w.state === "live" ? labels.happeningNow : labels.next}</Tag>}
      </div>
      <h3 className="text-xl font-bold text-balance text-fg">
        <Link href={`/workshops/${w.slug}`} className="rounded-sm after:absolute after:inset-0 after:rounded-lg">
          <BidiText text={loc(w, "title", l) ?? w.slug} />
        </Link>
      </h3>
      <time dateTime={isoAttr(w.starts_at)} className="text-fg-muted">
        {formatEventDate(w.starts_at, l)}
      </time>
      <SpeakerList event={w} locale={l} size={36} />
      {prepReady && (
        <p className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
          <ListChecks aria-hidden className="size-4 text-brand-purple-soft" />
          {labels.prepReady}
        </p>
      )}
      <span aria-hidden className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-brand-purple-soft">
        {labels.open}
        <Forward className="size-4" />
      </span>
    </article>
  );
}
