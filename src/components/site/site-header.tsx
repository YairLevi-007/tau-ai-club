import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "./language-switch";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  const meta = await getTranslations("meta");

  return (
    <header className="border-b border-border/60">
      <nav
        aria-label={t("label")}
        className="mx-auto flex max-w-site items-center justify-between gap-4 px-4 py-3 sm:px-6"
      >
        {/* Logo sits at the start (right in Hebrew, left in English). Never mirrored. */}
        <Link href="/" className="inline-flex items-center rounded-sm" aria-label={`${meta("siteName")} · ${t("home")}`}>
          <Image
            src="/brand/logo.png"
            alt=""
            width={367}
            height={226}
            priority
            className="h-10 w-auto [image-rendering:pixelated]"
          />
        </Link>
        <LanguageSwitch />
      </nav>
    </header>
  );
}
