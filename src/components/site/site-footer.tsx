import { getTranslations } from "next-intl/server";
import { SOCIAL } from "@/config/site";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const meta = await getTranslations("meta");

  return (
    <footer className="mt-24 border-t border-border/60 bg-bg-deep">
      <div className="mx-auto flex max-w-site flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-fg-subtle sm:px-6">
        <p>
          <span className="eyebrow-pixel" lang="en" dir="ltr">
            {t("tagline")}
          </span>
        </p>
        <div className="flex items-center gap-6">
          <a href={SOCIAL.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
            {t("instagram")}
            <span className="font-mono" dir="ltr">
              {" "}
              <bdi>@tau.ai.club</bdi>
            </span>
          </a>
          <span>
            © <bdi className="font-mono">{new Date().getFullYear()}</bdi> {meta("siteName")}
          </span>
        </div>
      </div>
    </footer>
  );
}
