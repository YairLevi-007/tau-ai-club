import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { FlyerChip } from "@/components/events/flyer-bits";
import { cn } from "@/lib/utils";

/** Last year's speakers' companies and the club's partners, from the recruiting post. Names only, never logos. */
const MET_WITH = ["Google", "Microsoft", "MongoDB", "Aleph", "Herzog Fox & Neeman"] as const;

/**
 * "About the club", in the club's own words from the cohort 02 recruiting post
 * (brand/instagram/recruiting-cohort-02.jpg, design/launch/NOTES.md). Server-rendered, no motion.
 */
export async function ClubAbout({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "home" });
  const cards = [1, 2, 3] as const;
  return (
    <section aria-labelledby="club-about-heading" data-testid="club-about" className="mx-auto max-w-site px-4 pt-20 sm:px-8 lg:pt-28">
      <FlyerChip locale={locale}>{t("aboutChip")}</FlyerChip>
      <h2
        id="club-about-heading"
        className={cn(
          "mt-4 grid leading-[0.95] text-fg",
          locale === "en"
            ? "font-pixel text-[clamp(2.25rem,7vw,4rem)] tracking-[0.02em] uppercase"
            : "text-[clamp(2.25rem,7vw,3.75rem)] font-extrabold tracking-[-0.01em]",
        )}
      >
        <span>{t("aboutLine1")}</span>
        <span className="flex items-center gap-[0.25em] text-brand-purple">
          {t("aboutLine2")}
          {locale === "he" && <span aria-hidden className="mt-[0.1em] size-[0.28em] shrink-0 bg-brand-purple" />}
        </span>
      </h2>
      {/* The post's tagline, in English on both locales (Silkscreen is Latin only). */}
      <p lang="en" className="eyebrow-pixel mt-5 text-[0.6875rem]">
        Building the Next Generation of AI Leaders
      </p>
      <p className="mt-3 max-w-[62ch] text-[1.0625rem] leading-relaxed text-pretty text-fg-muted">{t("aboutLead")}</p>

      <ul className="mt-8 grid gap-3 md:grid-cols-3 md:gap-4">
        {cards.map((n) => (
          <li key={n} className="rounded-lg border border-border bg-surface p-5 shadow-[var(--highlight-top)]">
            <span aria-hidden className="font-pixel text-[0.6875rem] tracking-[0.2em] text-brand-purple-soft">
              {`0${n}`}
            </span>
            <h3 className="mt-3 text-[1.1875rem] leading-tight font-bold text-fg">{t(`about${n}Title`)}</h3>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-fg-muted">{t(`about${n}Body`)}</p>
          </li>
        ))}
      </ul>

      <div className="mt-7 grid gap-4 border-t border-border pt-6">
        <NameRow label={t("metWith")} names={MET_WITH.map((n) => ({ name: n, lang: "en" as const }))} />
        <NameRow
          label={t("partners")}
          names={[
            { name: "Entrée Capital", lang: "en" as const },
            { name: t("partnerTau"), lang: locale },
          ]}
        />
      </div>
    </section>
  );
}

function NameRow({ label, names }: { label: string; names: { name: string; lang: string }[] }) {
  return (
    <div className="grid gap-2">
      <p className="text-[0.8125rem] text-fg-subtle">{label}</p>
      <ul className="flex flex-wrap items-center gap-y-1.5 text-[1.0625rem] font-semibold text-fg-muted">
        {names.map(({ name, lang }, i) => (
          <li key={name} lang={lang} className="flex items-center whitespace-nowrap">
            {i > 0 && <span aria-hidden className="mx-3.5 size-[5px] bg-brand-purple-deeper" />}
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
