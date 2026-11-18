import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/viewer";

export const metadata = { robots: { index: false, follow: false } };

/**
 * The old profile page. Everything on it (details, photo, my attendance) now lives in the
 * personal area (user, 18.11), so this only forwards there. Guests still go to log in first.
 */
export default async function ProfilePage({ params }: PageProps<"/[locale]/profile">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requireMember("/me");
  redirect({ href: "/me", locale: locale as Locale });
}
