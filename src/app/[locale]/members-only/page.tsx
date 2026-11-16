import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { SOCIAL } from "@/config/site";
import { getViewer } from "@/lib/auth/viewer";
import { AuthPanel, SignInButton, SignOutButton } from "@/components/auth/auth-buttons";

export async function generateMetadata({ params }: PageProps<"/[locale]/members-only">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("membersOnlyTitle"), robots: { index: false, follow: false } };
}

/**
 * Where non-allowlisted people land. No join request, no pending state: the club is
 * closed. Renders nothing about members, so there's nothing to leak.
 */
export default async function MembersOnlyPage({ params }: PageProps<"/[locale]/members-only">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const [t, viewer] = await Promise.all([getTranslations("auth"), getViewer()]);
  if (viewer.kind === "member") redirect({ href: "/", locale });

  return (
    <AuthPanel testId="members-only" title={t("membersOnlyTitle")}>
      <p>{t("membersOnlyBody")}</p>
      {viewer.kind === "outsider" ? (
        <>
          {viewer.email && (
            <p>
              {t("signedInAs")} <bdi dir="ltr">{viewer.email}</bdi>
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <SignOutButton />
            <SignInButton label={t("useAnotherAccount")} variant="ghost" />
          </div>
        </>
      ) : (
        <>
          <p>{t("membersOnlyGuest")}</p>
          <SignInButton />
        </>
      )}
      <p className="text-fg-subtle">
        <a
          href={SOCIAL.instagram}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm text-brand-purple-soft underline underline-offset-4 hover:text-brand-purple-softer"
        >
          {t("membersOnlyFollow")}
        </a>
      </p>
    </AuthPanel>
  );
}
