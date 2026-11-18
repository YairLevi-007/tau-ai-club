import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { ClubEvent, Speaker } from "@/lib/data/types";
import { loc } from "@/lib/event-format";
import { SpeakerFace, initialsOf } from "./speaker-face";
import { SpeakerLinkedIn } from "./speaker-linkedin";

/**
 * "This season's speakers": each speaker once, in the order they first appear in the
 * season. Plain, semantic markup on purpose (the designer styles it). Public fields only.
 */
export async function SeasonSpeakers({ events, locale }: { events: ClubEvent[]; locale: Locale }) {
  const seen = new Map<string, Speaker>();
  for (const e of events) for (const { speaker } of e.event_speakers) if (!seen.has(speaker.id)) seen.set(speaker.id, speaker);
  if (seen.size === 0) return null;
  const t = await getTranslations({ locale, namespace: "home" });

  return (
    <section aria-labelledby="season-speakers-heading" data-testid="season-speakers" className="mx-auto max-w-site px-4 pt-16 sm:px-8">
      <h2 id="season-speakers-heading" className="text-h2 font-bold">
        {t("seasonSpeakers")}
      </h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...seen.values()].map((sp) => {
          const name = loc(sp, "name", locale) ?? "";
          const role = loc(sp, "role", locale);
          const company = loc(sp, "company", locale);
          return (
            <li key={sp.id} data-testid="season-speaker" className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
              <SpeakerFace speaker={{ name, photoUrl: sp.photo_url, initials: initialsOf(name) }} size={64} />
              <div className="min-w-0 flex-1">
                <p className="leading-tight font-semibold text-fg">{name}</p>
                {role && <p className="mt-1 text-sm text-fg-subtle">{role}</p>}
                {company && <p className="text-sm text-fg-subtle">{company}</p>}
              </div>
              <SpeakerLinkedIn url={sp.linkedin_url} name={name} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
