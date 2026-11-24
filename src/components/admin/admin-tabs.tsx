"use client";

import { useEffect, useRef } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Underline tabs; scrolls sideways on narrow screens instead of wrapping into a stack.
 * On a phone the row is wider than the screen, so (round 2, item 9) a fade at the end edge shows
 * there's more, and the current tab is scrolled into view on load.
 */
export function AdminTabs({ label, tabs }: { label: string; tabs: { href: string; label: string; /** Current only on this exact path (the admin home). */ exact?: boolean }[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>("[aria-current=page]");
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    current.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
  }, [pathname]);
  return (
    <div className="relative -mx-4 sm:mx-0">
      <nav ref={navRef} aria-label={label} className="overflow-x-auto px-4 [scrollbar-width:none] sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-border pe-8 sm:pe-0">
          {tabs.map((tab) => {
            const current = pathname === tab.href || (!tab.exact && pathname.startsWith(`${tab.href}/`));
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-[0.9375rem] font-medium whitespace-nowrap transition-colors duration-150",
                    current
                      ? "border-brand-purple text-fg"
                      : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {/* "There's more this way": a fade over the end edge, phones only. Decorative. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 end-0 w-12 from-bg to-transparent sm:hidden ltr:bg-linear-to-l rtl:bg-linear-to-r"
      />
    </div>
  );
}
