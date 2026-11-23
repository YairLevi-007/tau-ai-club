import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getInitiative } from "@/lib/initiatives";
import { AdminHeader } from "@/components/admin/admin-header";
import { InitiativeForm } from "@/components/initiatives/initiative-form";
import { editInitiativeAdmin } from "../../actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/initiatives/[id]/edit">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "initiativesAdmin" });
  return { title: t("editTitle"), robots: { index: false, follow: false } };
}

/** An admin edits a published initiative (the lead can't once it's up). Text in this page's language. */
export default async function AdminEditInitiativePage({ params }: PageProps<"/[locale]/admin/initiatives/[id]/edit">) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin(`/admin/initiatives/${id}/edit`);
  const supabase = await createClient();
  if (!supabase) notFound();
  const initiative = await getInitiative(supabase, id);
  if (!initiative || initiative.status !== "published") notFound();
  const t = await getTranslations("initiativesAdmin");
  return (
    <div className="grid max-w-3xl gap-6">
      <AdminHeader title={t("editTitle")} body={t("editIntro")} />
      <InitiativeForm
        action={editInitiativeAdmin}
        locale={locale}
        isAdmin
        initiative={initiative}
        submitLabel={t("save")}
        cancelHref="/admin/initiatives?tab=published"
      />
    </div>
  );
}
