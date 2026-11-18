import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { TeamMember } from "@/lib/data/types";
import { loc } from "@/lib/event-format";
import { cn } from "@/lib/utils";
import { CornerBrackets } from "./flyer-bits";
import { PersonCard } from "./person-card";

/**
 * "Meet the club's founders", after the club's "Meet our managers" post. Same cards as the
 * season speakers. Role and company are English on both locales. Server-rendered, visible
 * without JS. Public fields only.
 */
export async function ClubFounders({ team, locale }: { team: TeamMember[]; locale: Locale }) {
  if (team.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "home" });

  return (
    <section aria-labelledby="club-founders-heading" data-testid="club-founders" className="relative mx-auto max-w-site px-4 pt-12 sm:px-8 lg:pt-16">
      <div className="relative isolate px-0 py-10 sm:px-8 sm:py-12">
        <div aria-hidden className="hero-grid absolute inset-0 -z-10 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_40%,var(--bg),transparent)]" />
        <CornerBrackets className="inset-0 hidden sm:block" />

        <h2
          id="club-founders-heading"
          className={cn(
            "grid leading-[0.95] text-fg",
            locale === "en"
              ? "font-pixel text-[clamp(2.25rem,7vw,4rem)] tracking-[0.02em] uppercase"
              : "text-[clamp(2.25rem,7vw,3.75rem)] font-extrabold tracking-[-0.01em]",
          )}
        >
          <span>{t("foundersLine1")}</span>
          <span className="flex items-center gap-[0.25em] text-brand-purple">
            {t("foundersLine2")}
            {locale === "he" && <span aria-hidden className="mt-[0.1em] size-[0.28em] shrink-0 bg-brand-purple" />}
          </span>
        </h2>

        <ul className="mt-8 flex flex-wrap justify-center gap-3 lg:gap-4">
          {team.map((m) => (
            <PersonCard
              key={m.id}
              testId="club-founder"
              locale={locale}
              name={loc(m, "name", locale) ?? ""}
              photoUrl={m.photo_url}
              company={m.company_en}
              role={m.role_en}
              linkedinUrl={m.linkedin_url}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
