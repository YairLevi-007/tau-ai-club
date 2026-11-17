import { Suspense } from "react";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { NotFoundView } from "@/components/site/not-found-view";

/**
 * Next 16 can't server-render a notFound() thrown by a page: React's server render
 * fails the whole document and Next sends a bare error shell (<html id="__next_error__">,
 * no lang/dir) that the browser fills in. This boundary stops it here, so the site
 * layout (lang, dir, header, footer) and this fallback (the 404 body) are in the HTML.
 * This route always 404s, so the fallback is always the right content.
 */
export default async function NotFoundBoundary({ children, params }: LayoutProps<"/[locale]/[...rest]">) {
  const { locale } = await params;
  const l = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  return <Suspense fallback={<NotFoundView locale={l} />}>{children}</Suspense>;
}
