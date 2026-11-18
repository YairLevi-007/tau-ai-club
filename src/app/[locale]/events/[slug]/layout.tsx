import { Suspense } from "react";

/**
 * Lets an unknown slug's notFound() stop here instead of failing the whole server
 * render (Next 16 would send a bare error shell without lang/dir; see
 * [...rest]/layout.tsx). Known events render fully at build/ISR time, so their HTML
 * is unchanged; an unknown slug gets the site layout and its 404 body in the browser.
 */
export default function EventBoundary({ children }: LayoutProps<"/[locale]/events/[slug]">) {
  return <Suspense>{children}</Suspense>;
}
