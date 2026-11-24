import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { authEnabled } from "@/lib/supabase/config";
import { requireMember } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getInitiative } from "@/lib/initiatives";
import { InitiativeForm } from "@/components/initiatives/initiative-form";
import { MembersEyebrow } from "@/components/members/members-eyebrow";
import { updateInitiative } from "../../actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/initiatives/[id]/edit">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "initiatives" });
  return { title: t("formEditTitle"), robots: { index: false, follow: false } };
}

/**
 * The lead edits their proposal while it waits or after it came back with a note; saving sends it
 * for approval again. A published one is edited only by an admin (DECISIONS 19.11).
 */
export default async function EditInitiativePage({ params }: PageProps<"/[locale]/initiatives/[id]/edit">) {
  const { locale: lc, id } = await params;
  if (!hasLocale(routing.locales, lc)) notFound();
  const locale = lc as Locale;
  setRequestLocale(locale);
  if (!authEnabled()) notFound();
  const viewer = await requireMember(`/initiatives/${id}/edit`);
  const supabase = await createClient();
  if (!supabase) notFound();
  const initiative = await getInitiative(supabase, id);
  if (!initiative || initiative.lead_id !== viewer.member.id || !(initiative.status === "pending" || initiative.status === "returned")) notFound();
  const t = await getTranslations("initiatives");
  return (
    <div className="relative isolate">
      <div className="mx-auto grid max-w-3xl gap-8 px-4 pt-10 pb-20 sm:px-8 lg:pt-14">
        <header className="grid gap-3">
          <MembersEyebrow />
          <h1 className="text-[clamp(2rem,7vw,3rem)] leading-[1.05] font-extrabold text-fg">{t("formEditTitle")}</h1>
          {initiative.review_note && initiative.status === "returned" && (
            <p className="max-w-[68ch] rounded-md border-s-2 border-brand-purple bg-bg-deep/60 px-4 py-3 text-fg-muted">
              <span className="font-semibold text-fg">{t("adminNote")}</span> {initiative.review_note}
            </p>
          )}
        </header>
        <InitiativeForm action={updateInitiative} locale={locale} isAdmin={false} initiative={initiative} />
      </div>
    </div>
  );
}
