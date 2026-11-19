import type { Locale } from "@/i18n/routing";
import type { ClubEvent, Speaker } from "@/lib/data/types";
import { loc } from "@/lib/event-format";
import { cn } from "@/lib/utils";
import { SpeakerAvatar } from "@/components/events/flyer-bits";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Each speaker once, in the order they first appear in the season (same as SeasonSpeakers). */
export function seasonSpeakers(events: ClubEvent[]): Speaker[] {
  const seen = new Map<string, Speaker>();
  for (const e of events) for (const { speaker } of e.event_speakers) if (!seen.has(speaker.id)) seen.set(speaker.id, speaker);
  return [...seen.values()];
}

/**
 * The season's speakers in the hero (design review 19.11, item 4). `wide`: a honeycomb of their faces
 * in the half of the hero that was empty (lg and up). `row`: a short overlapping row under the
 * tagline (below lg).
 * Both link down to "Meet the speakers". Public fields only (name, photo, company), no dates.
 * Decorative faces: the link text says what they are, and the names are in the section below.
 */
export function HeroFaces({
  speakers,
  locale,
  label,
  layout,
}: {
  speakers: Speaker[];
  locale: Locale;
  label: string;
  layout: "row" | "wide";
}) {
  if (speakers.length === 0) return null;
  const Forward = locale === "he" ? ChevronLeft : ChevronRight;
  const people = speakers.map((s) => ({ id: s.id, name: loc(s, "name", locale) ?? "", photo: s.photo_url, company: loc(s, "company", locale) }));

  // Rows of 2, 3, 2, 3… so the faces sit like a honeycomb.
  const rows: (typeof people)[] = [];
  for (let i = 0, r = 0; i < people.length; r++) {
    const n = r % 2 === 0 ? 2 : 3;
    rows.push(people.slice(i, i + n));
    i += n;
  }

  const link = (className: string) => (
    <a
      href="#season-speakers-heading"
      className={cn(
        "group inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-purple-soft underline-offset-4 hover:underline",
        className,
      )}
    >
      {label}
      <Forward aria-hidden className="size-4 transition-transform duration-150 ltr:group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
    </a>
  );

  // Phone and tablet (and members on wide screens): one overlapping row under the tagline.
  if (layout === "row")
    return (
      // Below lg for everyone; on wide screens too for a member, whose Next event card takes the
      // honeycomb's place (<html data-member-hint>, see MemberNextEvent).
      <div
        className="intro mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 [--i:5] lg:hidden lg:[[data-member-hint]_&]:flex"
        data-testid="hero-faces"
      >
        <span aria-hidden className="flex -space-x-2.5">
          {people.slice(0, 5).map((p) => (
            <SpeakerAvatar key={p.id} name={p.name} photoUrl={p.photo} size={40} />
          ))}
          {people.length > 5 && (
            <span className="relative grid size-10 place-items-center rounded-full border-2 border-brand-purple bg-bg-raised font-mono text-[0.8125rem] font-semibold text-fg">
              <bdi dir="ltr">+{people.length - 5}</bdi>
            </span>
          )}
        </span>
        {link("text-[0.9375rem]")}
      </div>
    );
  // Wide screens: the honeycomb, in the hero's second column.
  return (
      <div className="intro hidden justify-items-center gap-5 [--i:5] lg:grid" data-testid="hero-faces-wide">
        <div aria-hidden className="relative grid justify-items-center gap-y-1">
          <i className="absolute -start-6 top-6 size-4 bg-brand-purple" />
          <i className="absolute -end-4 bottom-10 size-6 bg-logo-block" />
          {rows.map((row, r) => (
            <div key={r} className="flex gap-4">
              {row.map((p) => (
                <SpeakerAvatar key={p.id} name={p.name} photoUrl={p.photo} company={p.company} size={88} />
              ))}
            </div>
          ))}
        </div>
        {link("text-base")}
      </div>
  );
}
