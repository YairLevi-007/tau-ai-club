import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { loc } from "@/lib/event-format";
import { ActionForm } from "@/components/admin/action-form";
import { inputClass, labelClass, smallBtn } from "@/components/admin/styles";
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
      <header className="grid gap-2">
        <h1 className="text-h2 font-bold">{t("venuesTitle")}</h1>
        <p className="max-w-[65ch] text-fg-muted">{t("venuesBody")}</p>
        {error && (
          <p role="alert" className="text-destructive">
            {t("errorGeneric")}
          </p>
        )}
      </header>

      <section aria-labelledby="add-venue" className="grid gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="add-venue" className="text-h3 font-bold">
          {t("addVenue")}
        </h2>
        <ActionForm action={saveVenue} resetOnSuccess className="grid gap-4">
          <VenueFields />
          <button type="submit" className="btn btn-primary h-10 w-fit px-4 text-sm">
            {t("add")}
          </button>
        </ActionForm>
      </section>

      <ul className="grid gap-3" data-testid="admin-venues">
        {venues.map((v) => (
          <li key={v.id} className="rounded-lg border border-border p-4">
            <details>
              <summary className="cursor-pointer font-bold">
                {loc(v, "name", locale)}{" "}
                <span className="text-sm font-normal text-fg-muted">· {t("eventCount", { n: v.events.length })}</span>
              </summary>
              <div className="mt-4 grid gap-4">
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
                  <button type="submit" className={`${smallBtn} text-destructive`}>
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
