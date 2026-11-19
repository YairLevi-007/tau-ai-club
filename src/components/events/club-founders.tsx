import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { TeamMember } from "@/lib/data/types";
import { loc } from "@/lib/event-format";
import { SectionHeading } from "@/components/home/section-heading";
import { PersonCard } from "./person-card";

/**
 * "Meet the club's founders", after the club's "Meet our managers" post. The same person card as
 * the season speakers, in its compact row form. Role and company are English on both locales.
 * Server-rendered, visible without JS. Public fields only.
 */
export async function ClubFounders({ team, locale }: { team: TeamMember[]; locale: Locale }) {
  if (team.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "home" });

  return (
    <section aria-labelledby="club-founders-heading" data-testid="club-founders" className="relative mx-auto max-w-site px-4 pt-14 pb-20 sm:px-8 lg:pt-20 lg:pb-28">
      {/* Smaller than the speakers on purpose, and in rows instead of the same tall cards, so the
          page doesn't repeat the same grid twice in a row (design review 19.11, item 7). */}
      <SectionHeading id="club-founders-heading" locale={locale} line1={t("foundersLine1")} line2={t("foundersLine2")} size="md" />

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:gap-4">
        {team.map((m) => (
          <PersonCard
            key={m.id}
            variant="row"
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
    </section>
  );
}
