import { getLocale } from "next-intl/server";
import { LockKeyhole } from "lucide-react";
import { loc } from "@/lib/event-format";
import type { Locale } from "@/i18n/routing";
import type { SeasonEvent } from "@/lib/data/types";
import { SpeakerFace, initialsOf } from "@/components/events/speaker-face";
import { cn } from "@/lib/utils";

/** Eyebrow: Silkscreen is Latin only, so Hebrew gets Rubik. */
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

/** Speakers of an event: face, name, and role/company when known (public fields only). */
export function SpeakerList({ event, locale, size = 56, className }: { event: SeasonEvent; locale: Locale; size?: number; className?: string }) {
  if (!event.event_speakers.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-x-6 gap-y-3", className)} data-testid="content-speakers">
      {event.event_speakers.map(({ speaker }) => {
        const name = loc(speaker, "name", locale) ?? "";
        const role = [loc(speaker, "role", locale), loc(speaker, "company", locale)].filter(Boolean).join(" · ");
        return (
          <li key={speaker.id} className="flex min-w-0 items-center gap-3">
            <SpeakerFace speaker={{ name, initials: initialsOf(name), photoUrl: speaker.photo_url }} size={size} />
            <span className="grid min-w-0">
              <span className="font-semibold text-fg">{name}</span>
              {role && <span className="text-sm text-fg-muted">{role}</span>}
            </span>
          </li>
        );
      })}
    </ul>
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
