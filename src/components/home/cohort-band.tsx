import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { SOCIAL } from "@/config/site";
import { authEnabled } from "@/lib/supabase/config";
import { FlyerChip } from "@/components/events/flyer-bits";
import { InstagramIcon } from "@/components/site/instagram-icon";
import { LinkedInIcon } from "@/components/site/linkedin-icon";
import { MemberAction } from "@/components/site/member-nav";

/**
 * The bottom band: in the cohort → log in (or "My area" after logging in); not in the cohort →
 * follow us. No sign-up and no lead form: only listed cohort members can log in.
 * The member card is hidden while the members area is off (no /login links then).
 */
export async function CohortBand({ locale }: { locale: Locale }) {
  const [t, tn, tf] = await Promise.all([
    getTranslations({ locale, namespace: "home" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "footer" }),
  ]);
  const authOn = authEnabled();
  const card = "flex flex-col items-start gap-4 rounded-lg border p-6 md:p-8";
  return (
    <section aria-label={t("bandLabel")} data-testid="cohort-band" className="mx-auto max-w-site px-4 pt-16 sm:px-8 lg:pt-24">
      <div className={authOn ? "grid gap-3 md:grid-cols-2 md:gap-4" : "grid"}>
        {authOn && (
          <div className={`${card} border-border-accent bg-brand-purple/[0.07] shadow-[var(--highlight-top)]`}>
            <div>
              <FlyerChip locale={locale}>{t("bandInTitle")}</FlyerChip>
              <p className="mt-3 max-w-[44ch] text-fg-muted">{t("bandInBody")}</p>
            </div>
            <MemberAction
              // Its own label: the header keeps the one "Member log in" link on the page.
              login={t("bandLogin")}
              myArea={tn("myArea")}
              className="btn btn-primary mt-auto"
              loginTestId="band-login"
              myAreaTestId="band-my-area"
            />
          </div>
        )}
        <div className={`${card} border-border bg-surface`}>
          <div>
            <FlyerChip locale={locale}>{t("bandOutTitle")}</FlyerChip>
            <p className="mt-3 max-w-[44ch] text-fg-muted">{t("bandOutBody")}</p>
          </div>
          <div className="mt-auto flex flex-wrap gap-2.5">
            <a href={SOCIAL.instagram} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              <InstagramIcon className="size-[18px]" />
              {tf("instagram")}
            </a>
            <a href={SOCIAL.linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              <LinkedInIcon className="size-[18px]" />
              {tf("linkedin")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
