import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";

/**
 * Localized <title> (QA audit N2). not-found gets no params, and next-intl's own locale
 * lookup falls back to headers() here, which breaks the ISR event pages; the root param
 * is static-safe.
 */
export async function generateMetadata(): Promise<Metadata> {
  const l = await rootLocale();
  const locale = hasLocale(routing.locales, l) ? l : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "errors" });
  return { title: t("notFoundTitle"), robots: { index: false, follow: false } };
}

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <div data-testid="not-found" className="mx-auto grid max-w-site gap-3 px-4 pt-20 pb-10 sm:px-8">
      <p className="font-mono text-sm text-brand-purple-soft">
        <bdi dir="ltr">404</bdi>
      </p>
      <h1 className="text-h1 font-bold">{t("notFoundTitle")}</h1>
      <p className="max-w-[60ch] text-fg-muted">{t("notFoundBody")}</p>
      <Link
        href="/"
        className="mt-2 w-fit rounded-sm text-brand-purple-soft underline underline-offset-4 hover:text-brand-purple-softer"
      >
        {t("goHome")}
      </Link>
    </div>
  );
}
