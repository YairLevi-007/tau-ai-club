import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate } from "@/lib/event-format";
import { ActionForm } from "@/components/admin/action-form";
import { inputClass, labelClass, smallBtn } from "@/components/admin/styles";
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
    <div className="grid gap-10">
      <header className="grid gap-2">
        <h1 className="text-h2 font-bold">{t("membersTitle")}</h1>
        <p className="max-w-[65ch] text-fg-muted">{t("membersBody")}</p>
        <p className="text-sm text-fg-subtle">{t("count", { n: members.length })}</p>
        {error && (
          <p role="alert" className="text-destructive">
            {t("errorGeneric")}
          </p>
        )}
      </header>

      <section aria-labelledby="add-member" className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <h2 id="add-member" className="text-h3 font-semibold">
          {t("addMemberTitle")}
        </h2>
        <ActionForm action={addMember} resetOnSuccess className="flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            {t("email")}
            <input name="email" type="email" required autoComplete="off" dir="ltr" className={inputClass} />
          </label>
          <label className={labelClass}>
            {t("fullName")}
            <input name="full_name" required maxLength={120} autoComplete="off" className={inputClass} />
          </label>
          <label className={labelClass}>
            {t("role")}
            <RoleSelect value="member" t={t} />
          </label>
          <button type="submit" className="btn btn-primary h-10">
            {t("add")}
          </button>
        </ActionForm>
      </section>

      <section aria-labelledby="members-list" className="grid gap-3">
        <h2 id="members-list" className="sr-only">
          {t("membersTitle")}
        </h2>
        <ul className="grid gap-3">
          {members.map((m) => {
            const emails = [...m.member_emails].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
            return (
              <li key={m.id} data-testid="member-row" className="grid gap-4 rounded-lg border border-border p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-lg font-semibold text-fg">{m.full_name}</p>
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

                <ul aria-label={t("emails")} className="grid gap-2">
                  {emails.map((e) => (
                    <li key={e.email} className="flex flex-wrap items-center gap-3 text-sm">
                      <bdi dir="ltr" className="font-mono text-fg">
                        {e.email}
                      </bdi>
                      {e.is_primary ? (
                        <span className="tag">{t("primary")}</span>
                      ) : (
                        <ActionForm action={removeEmail} className="contents">
                          <input type="hidden" name="email" value={e.email} />
                          <button type="submit" className="text-sm text-fg-subtle underline underline-offset-4 hover:text-fg">
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

                  <ActionForm action={addEmail} resetOnSuccess className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="member_id" value={m.id} />
                    <label className={labelClass}>
                      {t("addEmailLabel", { name: m.full_name })}
                      <input name="email" type="email" required autoComplete="off" dir="ltr" className={inputClass} />
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
                    <button type="submit" className="btn h-10 border-border px-3 text-sm text-destructive hover:bg-surface-hover">
                      {t("remove")}
                    </button>
                  </ActionForm>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="import" className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <h2 id="import" className="text-h3 font-semibold">
          {t("importTitle")}
        </h2>
        <p className="max-w-[65ch] text-sm text-fg-muted">{t("importBody")}</p>
        <ActionForm action={importCsv} resetOnSuccess className="grid gap-3">
          <label className={labelClass}>
            {t("importFile")}
            <input name="file" type="file" accept=".csv,text/csv" className="text-sm text-fg-muted file:me-3 file:rounded-md file:border file:border-border file:bg-surface-hover file:px-3 file:py-2 file:text-fg" />
          </label>
          <label className={labelClass}>
            {t("importText")}
            <textarea
              name="text"
              rows={5}
              dir="ltr"
              placeholder={"email,full_name,role\nname@gmail.com,Full Name,member"}
              className="min-h-28 rounded-md border border-border bg-bg p-3 font-mono text-sm text-fg placeholder:text-fg-faint"
            />
          </label>
          <button type="submit" className="btn btn-primary h-10 w-fit">
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
