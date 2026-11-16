import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
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

  return (
    <AuthPanel testId="welcome" title={t("welcomeTitle", { name: viewer.member.firstName })}>
      <p>{t("welcomeBody")}</p>
      <Link href={next} className="btn btn-primary w-fit">
        {t("continue")}
      </Link>
    </AuthPanel>
  );
}
