import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/**
 * The old workshops list. Lectures and workshops are together under "שיעורים / Lessons" (DECISIONS 24.11),
 * so this lands on that page's workshops column. Detail pages (/workshops/<slug>) are unchanged.
 */
export default async function WorkshopsListRedirect({ params }: PageProps<"/[locale]/workshops">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return redirect({ href: "/learn#workshops", locale: locale as Locale });
}
