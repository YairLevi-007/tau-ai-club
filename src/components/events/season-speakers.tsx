import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { ClubEvent, Speaker } from "@/lib/data/types";
import { loc } from "@/lib/event-format";
import { cn } from "@/lib/utils";
import { CornerBrackets, FlyerChip, SpeakerAvatar, roleCapsClass } from "./flyer-bits";
import { SpeakerLinkedIn } from "./speaker-linkedin";

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
    <section aria-labelledby="season-speakers-heading" data-testid="season-speakers" className="relative mx-auto max-w-site px-4 pt-20 sm:px-8 lg:pt-28">
      <div className="relative isolate px-0 py-10 sm:px-8 sm:py-12">
        {/* The post's frame: logo grid fading out, corner brackets. Decorative. */}
        <div aria-hidden className="hero-grid absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_40%,var(--bg),transparent)]" />
        <CornerBrackets className="inset-0 hidden sm:block" />

        <div className="grid gap-4">
          <FlyerChip locale={locale}>{t("seasonSpeakers")}</FlyerChip>
          <h2
            id="season-speakers-heading"
            className={cn(
              "grid leading-[0.95] text-fg",
              locale === "en"
                ? "font-pixel text-[clamp(2.25rem,7vw,4rem)] tracking-[0.02em] uppercase"
                : "text-[clamp(2.25rem,7vw,3.75rem)] font-extrabold tracking-[-0.01em]",
            )}
          >
            <span>{t("speakersLine1")}</span>
            <span className="flex items-center gap-[0.25em] text-brand-purple">
              {t("speakersLine2")}
              {locale === "he" && <span aria-hidden className="mt-[0.1em] size-[0.28em] shrink-0 bg-brand-purple" />}
            </span>
          </h2>
        </div>

        <ul className="mt-8 flex flex-wrap justify-center gap-3 lg:gap-4">
          {[...seen.values()].map((sp) => {
            const name = loc(sp, "name", locale) ?? "";
            const role = loc(sp, "role", locale);
            const company = loc(sp, "company", locale);
            return (
              <li
                key={sp.id}
                data-testid="season-speaker"
                className="relative flex w-[calc(50%-0.375rem)] flex-col items-center rounded-lg border border-border-accent bg-bg-deep px-3 pt-6 pb-4 text-center shadow-[var(--highlight-top)] lg:w-[calc(25%-0.75rem)]"
              >
                <span aria-hidden className="absolute -top-px inset-x-[14%] h-[3px] rounded-b-[3px] bg-brand-purple" />
                <SpeakerAvatar name={name} photoUrl={sp.photo_url} company={company} size={88} />
                <p className="mt-4 leading-tight font-bold text-fg lg:text-lg">{name}</p>
                {company && (
                  <p className="mt-1 text-sm text-fg-muted">
                    <bdi>{company}</bdi>
                  </p>
                )}
                {role && <p className={cn("mt-1.5 text-balance", roleCapsClass(locale))}>{role}</p>}
                <SpeakerLinkedIn url={sp.linkedin_url} name={name} className="mt-2" />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
