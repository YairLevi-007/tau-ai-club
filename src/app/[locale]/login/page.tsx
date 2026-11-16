import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { KeyRound, UserRoundCheck } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getViewer } from "@/lib/auth/viewer";
import { safeNext } from "@/lib/auth/next-path";
import { AuthAlert, AuthPanel, SignedInAs, SignInButton, SignOutButton } from "@/components/auth/auth-buttons";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("loginTitle"), robots: { index: false, follow: false } };
}

const ERRORS = { cancelled: "errorCancelled", failed: "errorFailed", unavailable: "errorUnavailable" } as const;

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const errorKey = typeof sp.error === "string" && sp.error in ERRORS ? ERRORS[sp.error as keyof typeof ERRORS] : null;

  const [t, nav, viewer] = await Promise.all([getTranslations("auth"), getTranslations("nav"), getViewer()]);
  // Signed in but not on the list: the members-only page explains what to do.
  if (viewer.kind === "outsider") redirect({ href: "/members-only", locale });
  const member = viewer.kind === "member";

  return (
    <AuthPanel testId="login" title={t("loginTitle")} icon={member ? <UserRoundCheck aria-hidden /> : <KeyRound aria-hidden />}>
      {member ? (
        <>
          {viewer.email && <SignedInAs label={t("signedInAs")} email={viewer.email} />}
          <div className="flex flex-wrap gap-3">
            <Link href={next} className="btn btn-primary w-full sm:w-fit">
              {t("continue")}
            </Link>
            {viewer.member.role === "admin" && (
              <Link href="/admin/members" className="btn btn-ghost">
                {nav("admin")}
              </Link>
            )}
            <SignOutButton />
          </div>
        </>
      ) : (
        <>
          <p>{t("loginBody")}</p>
          {errorKey && <AuthAlert>{t(errorKey)}</AuthAlert>}
          <SignInButton next={next} className="w-full sm:w-fit" />
        </>
      )}
    </AuthPanel>
  );
}
