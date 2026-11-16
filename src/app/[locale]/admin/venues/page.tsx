import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { loc } from "@/lib/event-format";
import { AdminHeader } from "@/components/admin/admin-header";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { ActionForm } from "@/components/admin/action-form";
import { dangerBtn, inputClass, labelClass, panelClass, panelTitle } from "@/components/admin/styles";
import { deleteVenue, saveVenue } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/venues">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("venuesTitle"), robots: { index: false, follow: false } };
}

type Venue = {
  id: string;
  name_he: string;
  name_en: string;
  address_he: string | null;
  address_en: string | null;
  maps_url: string | null;
  events: { id: string }[];
};

const ltr = `${inputClass} text-start`;

async function VenueFields({ venue }: { venue?: Venue }) {
  const t = await getTranslations("admin");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {venue && <input type="hidden" name="id" value={venue.id} />}
      <label className={labelClass}>
        {t("nameHe")}
        <input name="name_he" required dir="rtl" lang="he" defaultValue={venue?.name_he ?? ""} className={inputClass} />
      </label>
      <label className={labelClass}>
        {t("nameEn")}
        <input name="name_en" required dir="ltr" lang="en" defaultValue={venue?.name_en ?? ""} className={ltr} />
      </label>
      <label className={labelClass}>
        {t("addressHe")}
        <input name="address_he" dir="rtl" lang="he" defaultValue={venue?.address_he ?? ""} className={inputClass} />
      </label>
      <label className={labelClass}>
        {t("addressEn")}
        <input name="address_en" dir="ltr" lang="en" defaultValue={venue?.address_en ?? ""} className={ltr} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        {t("mapsUrl")}
        <input name="maps_url" type="url" dir="ltr" pattern="https://.+" defaultValue={venue?.maps_url ?? ""} className={ltr} />
      </label>
    </div>
  );
}

export default async function AdminVenuesPage({ params }: PageProps<"/[locale]/admin/venues">) {
  const { locale: l } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin("/admin/venues");
  const t = await getTranslations("admin");

  const supabase = await createClient();
  const { data, error } = supabase
    ? await supabase.from("venues").select("*, events(id)").order("name_en")
    : { data: [], error: null };
  const venues = (data ?? []) as Venue[];

  return (
    <div className="grid gap-8">
      <AdminHeader title={t("venuesTitle")} body={t("venuesBody")} alert={error ? t("errorGeneric") : null} />

      <section aria-labelledby="add-venue" className={cn(panelClass, "grid gap-4 p-4 sm:p-5")}>
        <h2 id="add-venue" className={panelTitle}>
          {t("addVenue")}
        </h2>
        <ActionForm action={saveVenue} resetOnSuccess className="grid gap-4">
          <VenueFields />
          <button type="submit" className="btn btn-primary h-10 w-fit px-4 text-sm">
            {t("add")}
          </button>
        </ActionForm>
      </section>

      <ul className={cn(panelClass, "divide-y divide-border overflow-hidden")} data-testid="admin-venues">
        {venues.map((v) => (
          <li key={v.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-surface-hover sm:px-5 [&::-webkit-details-marker]:hidden">
                <ChevronDown aria-hidden className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-open:rotate-180" />
                <span className="min-w-0 grow font-bold text-fg">{loc(v, "name", locale)}</span>
                <span className="shrink-0 text-sm text-fg-subtle">{t("eventCount", { n: v.events.length })}</span>
              </summary>
              <div className="grid gap-4 border-t border-border bg-bg-deep/30 p-4 sm:p-5">
                <ActionForm action={saveVenue} className="grid gap-4">
                  <VenueFields venue={v} />
                  <button type="submit" className="btn btn-primary h-10 w-fit px-4 text-sm">
                    {t("save")}
                  </button>
                </ActionForm>
                <ActionForm
                  action={deleteVenue}
                  confirmText={t("deleteVenueConfirm", { name: loc(v, "name", locale) ?? "", n: v.events.length })}
                >
                  <input type="hidden" name="id" value={v.id} />
                  <button type="submit" className={dangerBtn}>
                    {t("remove")}
                  </button>
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
