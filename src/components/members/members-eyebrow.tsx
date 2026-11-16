import { getLocale, getTranslations } from "next-intl/server";

/** "Members area" eyebrow: Silkscreen in English, Rubik in Hebrew (Silkscreen is Latin only). */
export async function MembersEyebrow() {
  const [t, locale] = await Promise.all([getTranslations("profile"), getLocale()]);
  return (
    <p className={locale === "he" ? "eyebrow-he text-sm" : "eyebrow-pixel text-[0.6875rem]"}>{t("eyebrow")}</p>
  );
}
