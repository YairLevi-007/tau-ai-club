import { getTranslations } from "next-intl/server";
import { RevealOnScroll } from "@/components/motion/reveal-on-scroll";
import type { Locale } from "@/i18n/routing";
import { FlyerChip } from "@/components/events/flyer-bits";
import { PixelIcon } from "./pixel-icon";
import { SectionHeading } from "./section-heading";

/** Last year's speakers' companies and the club's partners, from the recruiting post. Names only, never logos. */
const MET_WITH = ["Google", "Microsoft", "MongoDB", "Aleph", "Herzog Fox & Neeman"] as const;

/**
 * "About the club", in the club's own words from the cohort 02 recruiting post
 * (brand/instagram/recruiting-cohort-02.jpg, design/launch/NOTES.md). Server-rendered, no motion.
 */
export async function ClubAbout({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "home" });
  // Pixel icons from Sean Regev's pixel pass (DECISIONS 23.11): a calendar, a laptop, a group.
  const cards = [
    { n: 1, glyph: "week" },
    { n: 2, glyph: "build" },
    { n: 3, glyph: "people" },
  ] as const;
  return (
    <section aria-labelledby="club-about-heading" data-testid="club-about" className="mx-auto max-w-site px-4 pt-20 sm:px-8 lg:pt-28">
      <RevealOnScroll />
      <FlyerChip locale={locale}>{t("aboutChip")}</FlyerChip>
      <SectionHeading id="club-about-heading" locale={locale} line1={t("aboutLine1")} line2={t("aboutLine2")} className="mt-4" />
      {/* The post's tagline, in English on both locales (Silkscreen is Latin only). One line on a
          phone too (round 2, item 2): slightly smaller with tighter tracking below sm, so it fits
          from 360px up. Balanced if a narrower screen still wraps it. */}
      <p
        lang="en"
        className="eyebrow-pixel mt-5 text-[0.625rem] leading-[1.9] tracking-[0.1em] text-balance sm:text-[0.6875rem] sm:tracking-[0.25em]"
      >
        Building the Next Generation of AI Leaders
      </p>
      <p className="mt-3 max-w-[62ch] text-[1.0625rem] leading-relaxed text-pretty text-fg-muted">{t("aboutLead")}</p>

      {/* Phone: one raised panel with three short rows (they were three tall, mostly empty cards).
          From md: three cards side by side, as before. */}
      <ul className="mt-8 grid divide-y divide-border rounded-lg border border-brand-purple/40 bg-bg-raised shadow-[var(--highlight-top)] md:grid-cols-3 md:gap-4 md:divide-y-0 md:border-0 md:bg-transparent md:shadow-none">
        {cards.map(({ n, glyph }) => (
          <li
            key={n}
            data-reveal
            className="relative flex gap-4 px-4 py-4 md:card-light md:block md:rounded-lg md:border md:border-brand-purple/40 md:bg-bg-raised md:p-5 md:shadow-[var(--highlight-top)]"
          >
            {/* One box for all three, so the titles line up although "people" is wider. */}
            <span className="mt-0.5 flex w-11 shrink-0 justify-center md:w-auto md:justify-start">
              <PixelIcon glyph={glyph} className="h-8 w-auto md:h-11" />
            </span>
            <div className="grid gap-1 md:mt-4 md:gap-1.5">
              <h3 className="text-[1.0625rem] leading-tight font-bold text-fg md:text-[1.1875rem]">{t(`about${n}Title`)}</h3>
              <p className="text-[0.9375rem] leading-relaxed text-fg-muted">{t(`about${n}Body`)}</p>
            </div>
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
