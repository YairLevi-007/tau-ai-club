"use client";

import { useLocale, useTranslations } from "next-intl";
import NextLink from "next/link";
import { usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localizedPath } from "@/lib/seo";

/** Links to the same page in the other language. */
export function LanguageSwitch() {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;
  const other: Locale = locale === "he" ? "en" : "he";
  // Locale-free path, e.g. "/events/zero-to-hero-1".
  const pathname = usePathname();

  return (
    // A plain link to the final URL: next-intl's Link writes `/he/...` for the default
    // locale, which then 307s to `/...` (QA audit S6). Locale detection is off, so no cookie is needed.
    <NextLink
      href={localizedPath(other, pathname)}
      lang={other}
      hrefLang={other}
      className="inline-flex h-9 items-center rounded-md border border-border px-3 text-[0.8125rem] font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg"
    >
      {t("switchLanguage")}
    </NextLink>
  );
}
