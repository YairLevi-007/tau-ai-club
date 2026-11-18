"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin purple bar at the top that appears the moment a member taps a link to another page,
 * and goes away when the new page arrives. Member pages render on the server and can take a
 * second, and without this the tap looked like it didn't register (user, 18.11).
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const here = `${pathname}?${search}`;
  // The page we were on when the link was tapped; the bar shows until the route changes.
  const [from, setFrom] = useState<string | null>(null);
  const active = from === here;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (/\.(ics|pdf|png|jpe?g|svg|csv)$/i.test(url.pathname) || url.pathname.startsWith("/api/")) return;
      setFrom(here);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [here]);

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setFrom(null), 15000); // never stuck
    return () => clearTimeout(id);
  }, [active]);

  return (
    <div
      aria-hidden
      data-testid="nav-progress"
      data-active={active || undefined}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden opacity-0 transition-opacity duration-150 data-[active]:opacity-100"
    >
      <div className="nav-progress-bar h-full w-1/3 bg-brand-purple shadow-[0_0_8px_rgba(138,43,255,0.8)]" />
    </div>
  );
}
