import { getTranslations } from "next-intl/server";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import type { Locale } from "@/i18n/routing";
import type { ClubEvent, Speaker } from "@/lib/data/types";
import { loc } from "@/lib/event-format";
import { SectionHeading } from "@/components/home/section-heading";
import { CornerBrackets, FlyerChip } from "./flyer-bits";
import { PersonCard } from "./person-card";

/**
 * "Meet our speakers", after the club's Instagram post: each speaker once, in the order they
 * first appear in the season. Round photo with a purple ring, name, company, role in small caps.
 * Public fields only.
 */
export async function SeasonSpeakers({ events, locale }: { events: ClubEvent[]; locale: Locale }) {
  const seen = new Map<string, Speaker>();
  for (const e of events) for (const { speaker } of e.event_speakers) if (!seen.has(speaker.id)) seen.set(speaker.id, speaker);
  if (seen.size === 0) return null;
  const t = await getTranslations({ locale, namespace: "home" });

  return (
    <section aria-labelledby="season-speakers-heading" data-testid="season-speakers" className="relative mx-auto max-w-site px-4 pt-12 sm:px-8 lg:pt-20">
      <RevealOnScroll />
      <div className="relative isolate px-0 py-8 sm:px-8 sm:py-12">
        {/* The post's frame: logo grid fading out, corner brackets. Decorative. */}
        <div aria-hidden className="hero-grid absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_40%,var(--bg),transparent)]" />
        <CornerBrackets className="inset-0 hidden sm:block" />

        <div className="grid gap-4">
          <FlyerChip locale={locale}>{t("seasonSpeakers")}</FlyerChip>
          <SectionHeading id="season-speakers-heading" locale={locale} line1={t("speakersLine1")} line2={t("speakersLine2")} />
        </div>

        <ul className="mt-8 flex flex-wrap justify-center gap-3 lg:gap-4">
          {[...seen.values()].map((sp) => (
            <PersonCard
              key={sp.id}
              testId="season-speaker"
              locale={locale}
              name={loc(sp, "name", locale) ?? ""}
              photoUrl={sp.photo_url}
              company={loc(sp, "company", locale)}
              role={loc(sp, "role", locale)}
              linkedinUrl={sp.linkedin_url}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
