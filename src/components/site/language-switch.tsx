"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/** Links to the same page in the other language. */
export function LanguageSwitch() {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;
  const other: Locale = locale === "he" ? "en" : "he";
  // Locale-free path, e.g. "/events/zero-to-hero-1".
  const pathname = usePathname();

  return (
    <Link
      href={pathname}
      locale={other}
      lang={other}
      hrefLang={other}
      aria-label={t("switchLanguageLabel")}
      className="rounded-md border border-border px-3 py-1.5 text-sm text-fg transition-colors duration-150 hover:bg-surface-hover"
    >
      {t("switchLanguage")}
    </Link>
  );
}
