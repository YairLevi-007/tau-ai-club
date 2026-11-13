import { notFound } from "next/navigation";

/**
 * Any unknown path under a locale (e.g. /nope, /en/nope) lands here and
 * renders the localized [locale]/not-found.tsx inside the site layout.
 */
export default function CatchAll() {
  notFound();
}
