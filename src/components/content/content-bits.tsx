import { getLocale } from "next-intl/server";
import { LockKeyhole } from "lucide-react";
import { loc } from "@/lib/event-format";
import type { Locale } from "@/i18n/routing";
import type { EventState, SeasonEvent } from "@/lib/data/types";
import { SpeakerAvatar, roleCapsClass } from "@/components/events/flyer-bits";
import { raisedPanelClass } from "@/components/admin/styles";
import { cn } from "@/lib/utils";

/** Eyebrow: Silkscreen is Latin only, so Hebrew gets the sans. */
export async function Eyebrow({ he, en }: { he: string; en: string }) {
  const locale = await getLocale();
  return locale === "he" ? (
    <p className="eyebrow-he text-sm">{he}</p>
  ) : (
    <p className="eyebrow-pixel text-[0.6875rem]">{en}</p>
  );
}

/** Page intro for the lectures and workshops pages. */
export function ContentIntro({ eyebrow, title, body }: { eyebrow: React.ReactNode; title: string; body: string }) {
  return (
    <header className="grid gap-3">
      {eyebrow}
      <h1 className="text-[clamp(2.25rem,7vw,3.5rem)] leading-[1.05] font-extrabold text-balance text-fg">{title}</h1>
      <p className="max-w-[62ch] text-[1.0625rem] leading-relaxed text-fg-muted">{body}</p>
    </header>
  );
}

/**
 * Speakers of an event: the same ringed round photo with the company badge as on the home page,
 * then name, company and role (company first, role in the accent small caps), as on the home cards.
 * Public fields only.
 */
export function SpeakerList({ event, locale, size = 56, className }: { event: SeasonEvent; locale: Locale; size?: number; className?: string }) {
  if (!event.event_speakers.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-x-6 gap-y-3", className)} data-testid="content-speakers">
      {event.event_speakers.map(({ speaker }) => {
        const name = loc(speaker, "name", locale) ?? "";
        const company = loc(speaker, "company", locale);
        const role = loc(speaker, "role", locale);
        return (
          <li key={speaker.id} className="flex min-w-0 items-center gap-3">
            <SpeakerAvatar name={name} photoUrl={speaker.photo_url} company={company} size={size} />
            <span className="grid min-w-0">
              <span className="font-semibold text-fg">{name}</span>
              {company && (
                <span className="text-sm text-fg-muted">
                  <bdi>{company}</bdi>
                </span>
              )}
              {role && <span className={roleCapsClass(locale)}>{role}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A lecture or workshop card in the personal area's look (user, 19.11: the whole site follows
 * /me): the purple raised panel. Coming and next ones get the stronger purple edge; past ones
 * stay a step quieter. For the cards in lectures/page.tsx and workshops/page.tsx.
 */
export function contentCardClass(state: EventState) {
  return cn(
    raisedPanelClass,
    "relative grid gap-4 p-5 shadow-[var(--highlight-top)] transition-colors duration-150 hover:border-brand-purple sm:p-6",
    state === "past" ? "border-border-strong" : state === "next" || state === "live" ? "border-brand-purple shadow-[var(--glow-featured)]" : "",
  );
}

/** "Members only" marker: icon plus text, so it never relies on color. */
export function MembersOnlyMark({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-fg-subtle", className)}>
      <LockKeyhole aria-hidden className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}

/**
 * Stands in for the members-only part while the members area is off (authEnabled() false).
 * Server-rendered and static: no fetch, no sign-in link, and no members-only text.
 */
export function MembersSoon({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid gap-3 rounded-lg border border-border-accent bg-surface p-5 sm:p-6" data-testid="members-soon">
      <p className="flex items-center gap-2 font-semibold text-fg">
        <LockKeyhole aria-hidden className="size-4 shrink-0 text-brand-purple-soft" />
        {title}
      </p>
      <p className="max-w-[60ch] text-fg-muted">{body}</p>
    </div>
  );
}
