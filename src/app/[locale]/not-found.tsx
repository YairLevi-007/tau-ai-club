import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <div className="mx-auto grid max-w-site gap-3 px-4 pt-20 sm:px-6">
      <h1 className="text-h1 font-bold">{t("notFoundTitle")}</h1>
      <p>{t("notFoundBody")}</p>
      <Link href="/" className="w-fit text-brand-purple-soft underline underline-offset-4 hover:text-brand-purple-softer">
        {t("goHome")}
      </Link>
    </div>
  );
}
