import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/**
 * The old lectures list. Lectures and workshops are together under "שיעורים / Lessons" (DECISIONS 24.11),
 * so this lands on that page's lectures column. Detail pages (/lectures/<slug>) are unchanged.
 */
export default async function LecturesListRedirect({ params }: PageProps<"/[locale]/lectures">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return redirect({ href: "/learn#lectures", locale: locale as Locale });
}
