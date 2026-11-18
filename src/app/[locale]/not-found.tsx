import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { routing } from "@/i18n/routing";
import { NotFoundView } from "@/components/site/not-found-view";

// not-found gets no params, and next-intl's own locale lookup falls back to headers()
// here, which breaks the ISR event pages; the root param is static-safe.
async function notFoundLocale() {
  const l = await rootLocale();
  return hasLocale(routing.locales, l) ? l : routing.defaultLocale;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await notFoundLocale();
  const t = await getTranslations({ locale, namespace: "errors" });
  return { title: t("notFoundTitle"), robots: { index: false, follow: false } };
}

export default async function NotFound() {
  const locale = await notFoundLocale();
  setRequestLocale(locale);
  return <NotFoundView locale={locale} />;
}
