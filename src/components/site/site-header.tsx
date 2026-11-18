import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { LockKeyhole } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SOCIAL } from "@/config/site";
import { authEnabled } from "@/lib/supabase/config";
import { InstagramIcon } from "./instagram-icon";
import { LanguageSwitch } from "./language-switch";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  const meta = await getTranslations("meta");
  const tc = await getTranslations("content");
  // Same HTML for everyone (public pages stay cacheable): Workshops shows a lock, and the
  // page itself sends guests to sign in.
  const sectionLinks = (className: string) => (
    <ul className={className}>
      <li>
        <Link href="/lectures" className={navLinkClass}>
          {tc("navLectures")}
        </Link>
      </li>
      <li>
        <Link href="/workshops" className={navLinkClass}>
          {tc("navWorkshops")}
          <LockKeyhole aria-hidden className="size-3.5 text-fg-subtle" />
          <span className="sr-only"> ({tc("navMembersOnly")})</span>
        </Link>
      </li>
    </ul>
  );

  return (
    <header className="relative z-10">
      <nav
        aria-label={t("label")}
        className="mx-auto flex h-16 max-w-site items-center justify-between gap-4 px-4 sm:px-8 lg:h-[4.75rem]"
      >
        {/* Logo sits at the start (right in Hebrew, left in English). Never mirrored. */}
        <Link
          href="/"
          className="intro-fade inline-flex items-center rounded-sm"
          aria-label={`${meta("siteName")} · ${t("home")}`}
        >
          <Image
            src="/brand/logo-mark.png"
            alt=""
            width={520}
            height={322}
            // Audit N4: the slot is 65px wide (78px from lg), so ask for a small file, not w=640.
            sizes="(min-width: 1024px) 78px, 65px"
            priority
            className="h-10 w-auto [image-rendering:pixelated] lg:h-12"
          />
        </Link>
        {sectionLinks("intro-fade me-auto ms-4 hidden items-center gap-1 sm:flex [--i:1] lg:ms-8")}
        <div className="intro-fade flex items-center gap-1.5 [--i:1]">
          <a
            href={SOCIAL.instagram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("instagramLabel")}
            className="inline-flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg"
          >
            <InstagramIcon className="size-[18px]" />
          </a>
          {/* Static link (same HTML for everyone, so public pages stay cacheable). /login knows who you are.
              Hidden while the members area is off (authEnabled(): no AUTH_ENABLED / Supabase, or seed mode). */}
          {authEnabled() && (
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-md px-3 text-[0.8125rem] font-medium text-fg-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg"
            >
              {t("signIn")}
            </Link>
          )}
          <LanguageSwitch />
        </div>
      </nav>
      <nav aria-label={tc("navLabel")} className="sm:hidden">
        {sectionLinks("-mt-1 flex items-center gap-1 overflow-x-auto px-2.5 pb-2")}
      </nav>
    </header>
  );
}

const navLinkClass =
  "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[0.875rem] font-medium whitespace-nowrap text-fg-muted transition-colors duration-150 hover:bg-surface-hover hover:text-fg";
