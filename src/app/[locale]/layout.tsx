import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Rubik, Silkscreen } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeDir, routing, type Locale } from "@/i18n/routing";
import { SITE_URL } from "@/config/site";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import "../globals.css";

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-rubik",
  display: "swap",
});
const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-silkscreen",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#0b0a1f",
  colorScheme: "dark",
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("title"), template: `%s · ${t("siteName")}` },
    description: t("description"),
    alternates: {
      canonical: locale === routing.defaultLocale ? "/" : `/${locale}`,
      languages: { he: "/", en: "/en", "x-default": "/" },
    },
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      title: t("title"),
      description: t("description"),
      locale: locale === "he" ? "he_IL" : "en_US",
    },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "nav" });

  return (
    <html
      lang={locale}
      dir={localeDir[locale as Locale]}
      className={`dark ${rubik.variable} ${silkscreen.variable} ${plexMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-bg-raised focus:px-4 focus:py-2 focus:text-fg"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
