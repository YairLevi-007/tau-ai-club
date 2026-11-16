import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";

/**
 * Speaker contact details moved into each event's edit page (consent is per speaker, so
 * every session of a returning speaker shows the same status). Old links land on Events.
 */
export default async function AdminSpeakersPage({ params }: PageProps<"/[locale]/admin/speakers">) {
  const { locale: l } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin("/admin/speakers");
  redirect({ href: "/admin/events", locale });
}
