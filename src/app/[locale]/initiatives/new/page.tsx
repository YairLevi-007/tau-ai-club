import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { authEnabled } from "@/lib/supabase/config";
import { requireMember } from "@/lib/auth/viewer";
import { InitiativeForm } from "@/components/initiatives/initiative-form";
import { MembersEyebrow } from "@/components/members/members-eyebrow";
import { proposeInitiative } from "../actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/initiatives/new">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "initiatives" });
  return { title: t("formNewTitle"), robots: { index: false, follow: false } };
}

/** Propose an initiative. A member's waits for an admin; an admin's goes up at once. */
export default async function NewInitiativePage({ params }: PageProps<"/[locale]/initiatives/new">) {
  const { locale: lc } = await params;
  if (!hasLocale(routing.locales, lc)) notFound();
  const locale = lc as Locale;
  setRequestLocale(locale);
  if (!authEnabled()) notFound();
  const viewer = await requireMember("/initiatives/new");
  const t = await getTranslations("initiatives");
  const isAdmin = viewer.member.role === "admin";
  return (
    <div className="relative isolate">
      <div className="mx-auto grid max-w-3xl gap-8 px-4 pt-10 pb-20 sm:px-8 lg:pt-14">
        <header className="grid gap-3">
          <MembersEyebrow />
          <h1 className="text-[clamp(2rem,7vw,3rem)] leading-[1.05] font-extrabold text-fg">{t("formNewTitle")}</h1>
          <p className="max-w-[68ch] text-fg-muted">{isAdmin ? t("formIntroAdmin") : t("formIntro")}</p>
        </header>
        <InitiativeForm action={proposeInitiative} locale={locale} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
