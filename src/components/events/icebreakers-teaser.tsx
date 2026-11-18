import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { FlyerChip } from "./flyer-bits";

/**
 * "Icebreaker games for club members: coming soon" (open initiative #03, design/icebreakers-teaser.md).
 * A teaser only: no button, no link, no motion. Server-rendered, visible without JS.
 * The dashed border is the "not here yet" cue; the chip says it in words.
 */
export async function IcebreakersTeaser({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "home" });
  return (
    <section aria-labelledby="icebreakers-heading" data-testid="icebreakers-teaser" className="mx-auto max-w-site px-4 pt-12 sm:px-8 lg:pt-16">
      <div className="sm:px-8">
        <div className="grid items-center gap-6 rounded-lg border-[1.5px] border-dashed border-border-strong bg-bg-deep px-5 py-6 md:grid-cols-[1fr_auto] md:gap-12 md:px-10 md:py-9">
          <div>
            <FlyerChip locale={locale}>{t("icebreakersSoon")}</FlyerChip>
            <h2
              id="icebreakers-heading"
              className={cn(
                "mt-3.5 text-[clamp(1.625rem,4vw,2.25rem)] leading-[1.1] tracking-[-0.01em] text-balance text-fg",
                locale === "he" ? "font-extrabold" : "font-bold",
              )}
            >
              {t("icebreakersTitle")}
            </h2>
            <p className="mt-2 max-w-[52ch] text-fg-muted">
              {t.rich("icebreakersBody", {
                pair: (chunks) => (
                  <bdi dir="ltr" className="font-mono font-medium">
                    {chunks}
                  </bdi>
                ),
              })}
            </p>
          </div>
          <PairMotif />
        </div>
      </div>
    </section>
  );
}

/** Two empty seats joined by pixel squares: a pairing. Decorative. */
function PairMotif() {
  const seat =
    "grid size-16 place-items-center rounded-full border-2 border-dashed border-brand-purple-soft bg-bg-raised font-pixel text-[1.375rem] leading-none text-brand-purple-soft md:size-[4.75rem]";
  return (
    <div aria-hidden className="flex items-center gap-2.5 justify-self-start md:justify-self-end">
      <span className={seat}>?</span>
      <span className="flex gap-[5px]">
        <i className="size-[7px] bg-brand-purple" />
        <i className="size-[7px] bg-brand-purple-deeper" />
        <i className="size-[7px] bg-logo-block" />
        <i className="size-[7px] bg-brand-purple-deeper" />
      </span>
      <span className={seat}>?</span>
    </div>
  );
}
