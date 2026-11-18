import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/event-format";
import { ActionForm } from "@/components/admin/action-form";
import { AdminHeader } from "@/components/admin/admin-header";
import {
  dangerBtn,
  inputClass,
  labelClass,
  panelClass,
  panelTitle,
  smallBtn,
} from "@/components/admin/styles";
import { FilePicker } from "@/components/admin/file-picker";
import { cn } from "@/lib/utils";
import { addEmail, addMember, importCsv, removeEmail, removeMember, setRole } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/members">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("membersTitle"), robots: { index: false, follow: false } };
}

type MemberRow = {
  id: string;
  full_name: string;
  role: "member" | "admin";
  member_emails: { email: string; is_primary: boolean }[];
  profiles: { welcomed_at: string | null } | null;
};

export default async function AdminMembersPage({ params }: PageProps<"/[locale]/admin/members">) {
  const { locale: l } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin("/admin/members");
  const t = await getTranslations("admin");

  const supabase = await createClient();
  const { data, error } = supabase
    ? await supabase
        .from("members")
        .select("id, full_name, role, member_emails ( email, is_primary ), profiles ( welcomed_at )")
        .order("full_name")
    : { data: [], error: null };
  const members = (data ?? []) as unknown as MemberRow[];

  return (
    <div className="grid gap-8">
      <AdminHeader
        title={t("membersTitle")}
        body={t("membersBody")}
        meta={t("count", { n: members.length })}
        alert={error ? t("errorGeneric") : null}
      />

      <section aria-labelledby="add-member" className={cn(panelClass, "grid gap-4 p-4 sm:p-5")}>
        <h2 id="add-member" className={panelTitle}>
          {t("addMemberTitle")}
        </h2>
        <ActionForm
          action={addMember}
          resetOnSuccess
          className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_9rem_auto] sm:items-end"
        >
          <label className={labelClass}>
            {t("email")}
            <input name="email" type="email" required autoComplete="off" dir="ltr" className={cn(inputClass, "text-start")} />
          </label>
          <label className={labelClass}>
            {t("fullName")}
            <input name="full_name" required maxLength={120} autoComplete="off" className={inputClass} />
          </label>
          <label className={labelClass}>
            {t("role")}
            <RoleSelect value="member" t={t} />
          </label>
          <button type="submit" className="btn btn-primary h-10 px-5 text-sm">
            {t("add")}
          </button>
        </ActionForm>
      </section>

      <section aria-labelledby="members-list" className={cn(panelClass, "overflow-hidden")}>
        <h2 id="members-list" className="sr-only">
          {t("membersTitle")}
        </h2>
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const emails = [...m.member_emails].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
            return (
              <li key={m.id} data-testid="member-row" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                    <p className="min-w-0 text-base font-bold break-words text-fg">{m.full_name}</p>
                    {m.role === "admin" && <span className="tag tag-next">{t("roleAdmin")}</span>}
                  </div>
                  <p className="text-sm text-fg-subtle">
                    {m.profiles?.welcomed_at ? (
                      <>
                        {t("firstLogin")}: <bdi>{formatShortDate(m.profiles.welcomed_at, locale)}</bdi>
                      </>
                    ) : (
                      t("neverSignedIn")
                    )}
                  </p>
                </div>

                <ul aria-label={t("emails")} className="flex flex-wrap gap-2">
                  {emails.map((e) => (
                    <li
                      key={e.email}
                      className="flex min-w-0 max-w-full items-center gap-2 rounded-md border border-border bg-bg-deep/45 py-1 ps-2.5 pe-1.5 text-sm"
                    >
                      <bdi dir="ltr" className="block min-w-0 truncate font-mono text-[0.8125rem] text-fg">
                        {e.email}
                      </bdi>
                      {e.is_primary ? (
                        <span className="pe-1 text-xs text-brand-purple-soft">{t("primary")}</span>
                      ) : (
                        <ActionForm action={removeEmail} className="contents">
                          <input type="hidden" name="email" value={e.email} />
                          <button
                            type="submit"
                            className="rounded px-1.5 py-0.5 text-xs text-fg-subtle underline underline-offset-4 hover:text-fg"
                          >
                            {t("removeEmail")}
                          </button>
                        </ActionForm>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                  <ActionForm action={setRole} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="member_id" value={m.id} />
                    <label className={labelClass}>
                      {t("role")}
                      <RoleSelect value={m.role} t={t} />
                    </label>
                    <button type="submit" className={smallBtn}>
                      {t("save")}
                    </button>
                  </ActionForm>

                  <ActionForm action={addEmail} resetOnSuccess className="flex min-w-0 grow flex-wrap items-end gap-2 sm:grow-0">
                    <input type="hidden" name="member_id" value={m.id} />
                    <label className={cn(labelClass, "min-w-0 grow break-words")}>
                      {t("addEmailLabel", { name: m.full_name })}
                      <input name="email" type="email" required autoComplete="off" dir="ltr" className={cn(inputClass, "text-start sm:w-64")} />
                    </label>
                    <button type="submit" className={smallBtn}>
                      {t("add")}
                    </button>
                  </ActionForm>

                  <ActionForm
                    action={removeMember}
                    confirmText={t("removeConfirm", { name: m.full_name })}
                    className="ms-auto flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="member_id" value={m.id} />
                    <button type="submit" className={dangerBtn}>
                      {t("remove")}
                    </button>
                  </ActionForm>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="import" className={cn(panelClass, "grid gap-4 p-4 sm:p-5")}>
        <div className="grid gap-1.5">
          <h2 id="import" className={panelTitle}>
            {t("csvImportTitle")}
          </h2>
          <p className="max-w-[65ch] text-sm text-fg-muted">{t("csvImportBody")}</p>
        </div>
        <ActionForm action={importCsv} resetOnSuccess className="grid gap-4 lg:grid-cols-2">
          <label className={labelClass}>
            {t("importFile")}
            <FilePicker name="file" accept=".csv,text/csv" />
          </label>
          <label className={cn(labelClass, "lg:row-span-2")}>
            {t("importText")}
            <textarea
              name="text"
              rows={5}
              dir="ltr"
              placeholder={"email,full_name,role\nname@gmail.com,Full Name,member"}
              className={cn(inputClass, "h-auto min-h-32 py-2.5 font-mono text-sm leading-relaxed")}
            />
          </label>
          <button type="submit" className="btn btn-primary h-10 w-full px-5 text-sm sm:w-fit lg:self-end">
            {t("importButton")}
          </button>
        </ActionForm>
      </section>
    </div>
  );
}

function RoleSelect({ value, t }: { value: string; t: (k: "roleMember" | "roleAdmin") => string }) {
  return (
    <select name="role" defaultValue={value} className={inputClass}>
      <option value="member">{t("roleMember")}</option>
      <option value="admin">{t("roleAdmin")}</option>
    </select>
  );
}
