import { Suspense } from "react";
import { authEnabled } from "@/lib/supabase/config";
import { requireMember } from "@/lib/auth/viewer";

/**
 * Lets an unknown slug's notFound() stop here instead of failing the whole server
 * render (Next 16 would send a bare error shell without lang/dir; see
 * [...rest]/layout.tsx). Known events render fully at build/ISR time, so their HTML
 * is unchanged; an unknown slug gets the site layout and its 404 body in the browser.
 *
 * Members area on: meetup pages are members only (docs/DECISIONS.md). The check runs
 * here, outside the Suspense boundary, so guests get a real redirect status instead of
 * a 200 page that redirects in the browser.
 */
export default async function EventBoundary({ children, params }: LayoutProps<"/[locale]/events/[slug]">) {
  if (authEnabled()) {
    const { slug } = await params;
    await requireMember(`/events/${slug}`);
  }
  return <Suspense>{children}</Suspense>;
}
