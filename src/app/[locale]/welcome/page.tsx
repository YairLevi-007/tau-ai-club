import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight, PartyPopper } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/viewer";
import { safeNext } from "@/lib/auth/next-path";
import { AuthPanel } from "@/components/auth/auth-buttons";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** First-login welcome. The callback sends members here once (profiles.welcomed_at). */
export default async function WelcomePage({ params, searchParams }: PageProps<"/[locale]/welcome">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const viewer = await requireMember("/welcome");
  const t = await getTranslations("auth");
  const Forward = locale === "he" ? ArrowLeft : ArrowRight;

  return (
    <AuthPanel testId="welcome" title={t("welcomeTitle", { name: viewer.member.firstName })} icon={<PartyPopper aria-hidden />}>
      <p>{t("welcomeBody")}</p>
      <div className="flex flex-wrap gap-3">
        <Link href={next} className="btn btn-primary w-full sm:w-fit">
          {t("continue")}
          <Forward aria-hidden />
        </Link>
        {next !== "/profile" && next !== "/me" && (
          <Link href="/me" className="btn btn-ghost w-full sm:w-fit">
            {t("welcomeProfile")}
          </Link>
        )}
      </div>
    </AuthPanel>
  );
}
