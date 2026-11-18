import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SOCIAL } from "@/config/site";
import { InstagramIcon } from "./instagram-icon";
import { LanguageSwitch } from "./language-switch";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  const meta = await getTranslations("meta");

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
          <LanguageSwitch />
        </div>
      </nav>
    </header>
  );
}
