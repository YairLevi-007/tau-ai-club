import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { KeyRound, MailCheck, UserRoundCheck } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getViewer } from "@/lib/auth/viewer";
import { safeNext } from "@/lib/auth/next-path";
import { AuthAlert, AuthPanel, SignedInAs, SignOutButton } from "@/components/auth/auth-buttons";
import { hintClass, inputClass, labelClass } from "@/components/admin/styles";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("loginTitle"), robots: { index: false, follow: false } };
}

const ERRORS = {
  cancelled: "errorCancelled",
  failed: "errorFailed",
  unavailable: "errorUnavailable",
  email: "errorEmail",
  code: "errorCode",
  expired: "errorExpired",
  throttled: "errorThrottled",
} as const;

/**
 * "Member log in" with an email code (no public sign-up). Step 1 posts the email to /api/auth/otp; step 2
 * (?sent=1) posts the code to /api/auth/verify. Plain forms: works without JavaScript.
 * The pending email is kept in an HttpOnly cookie, never in the URL or this page.
 */
export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, "/me");
  const sent = sp.sent === "1";
  const errorKey = typeof sp.error === "string" && sp.error in ERRORS ? ERRORS[sp.error as keyof typeof ERRORS] : null;

  const [t, nav, viewer] = await Promise.all([getTranslations("auth"), getTranslations("nav"), getViewer()]);
  // Signed in but not on the list: the members-only page explains what to do.
  if (viewer.kind === "outsider") redirect({ href: "/members-only", locale });

  if (viewer.kind === "member") {
    return (
      <AuthPanel testId="login" title={t("loginTitle")} icon={<UserRoundCheck aria-hidden />}>
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
      </AuthPanel>
    );
  }

  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
    </>
  );

  if (sent) {
    return (
      <AuthPanel testId="login" title={t("codeTitle")} icon={<MailCheck aria-hidden />}>
        <p data-testid="code-sent">{t("codeSent")}</p>
        {errorKey && <AuthAlert>{t(errorKey)}</AuthAlert>}
        <form action="/api/auth/verify" method="post" className="grid gap-4" data-testid="code-form">
          {hidden}
          <label className={labelClass}>
            {t("codeLabel")}
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 \-]{6,12}"
              maxLength={12}
              dir="ltr"
              className={`${inputClass} text-start font-mono tracking-[0.3em]`}
            />
          </label>
          <p className={hintClass}>{t("codeHint")}</p>
          <button type="submit" className="btn btn-primary w-full sm:w-fit">
            {t("codeSubmit")}
          </button>
        </form>
        <Link href={{ pathname: "/login", query: { next } }} className="w-fit text-sm text-brand-purple-soft underline underline-offset-4 hover:text-fg">
          {t("useAnotherEmail")}
        </Link>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel testId="login" title={t("loginTitle")} icon={<KeyRound aria-hidden />}>
      <p>{t("loginBody")}</p>
      {errorKey && <AuthAlert>{t(errorKey)}</AuthAlert>}
      <form action="/api/auth/otp" method="post" className="grid gap-4" data-testid="email-form">
        {hidden}
        <label className={labelClass}>
          {t("emailLabel")}
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            className={`${inputClass} text-start`}
          />
        </label>
        <button type="submit" className="btn btn-primary w-full sm:w-fit">
          {t("emailSubmit")}
        </button>
      </form>
    </AuthPanel>
  );
}
