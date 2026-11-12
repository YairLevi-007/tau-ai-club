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
      className="inline-flex h-9 items-center rounded-md border border-border px-3 text-[0.8125rem] font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg"
    >
      {t("switchLanguage")}
    </Link>
  );
}
