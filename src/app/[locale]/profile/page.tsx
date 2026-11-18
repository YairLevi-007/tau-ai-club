import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight, Eye, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/members/photos";
import { getMemberProfile, getMyContact } from "@/lib/members/profile";
import { ActionForm } from "@/components/admin/action-form";
import {
  hintClass,
  inputClass,
  labelClass,
  raisedPanelClass,
  panelTitle,
  smallBtn,
} from "@/components/admin/styles";
import { FilePicker } from "@/components/admin/file-picker";
import { MemberAvatar } from "@/components/members/member-avatar";
import { ProfileSubline } from "@/components/members/profile-subline";
import { MembersEyebrow } from "@/components/members/members-eyebrow";
import { SignOutButton } from "@/components/auth/auth-buttons";
import { cn } from "@/lib/utils";
import { PageBackdrop } from "@/components/site/page-backdrop";
import { removePhoto, saveProfile, uploadPhoto } from "./actions";
import { MyAttendance } from "@/components/members/my-attendance";

export async function generateMetadata({ params }: PageProps<"/[locale]/profile">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const textareaClass = inputClass.replace("h-10", "min-h-28 py-2 leading-relaxed");

/** The signed-in member edits their own profile. RLS allows writes to their own row only. */
export default async function ProfilePage({ params }: PageProps<"/[locale]/profile">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const viewer = await requireMember("/profile");
  const t = await getTranslations("profile");

  const supabase = await createClient();
  const [profile, contact] = supabase
    ? await Promise.all([getMemberProfile(supabase, viewer.member.id), getMyContact(supabase)])
    : [null, null];
  const photos = supabase && profile ? await signPhotos(supabase, [profile.photo_url]) : new Map<string, string>();
  const photoSrc = profile?.photo_url ? (photos.get(profile.photo_url) ?? null) : null;
  const links = profile?.links ?? {};
  const name = profile?.full_name ?? viewer.member.fullName;
  const subline = [profile?.year ? t("yearN", { n: profile.year }) : null, profile?.faculty, profile?.program];

  return (
    <div className="relative isolate">
    <PageBackdrop />
    <div className="mx-auto max-w-site px-4 pt-10 pb-20 sm:px-8 lg:pt-14" data-testid="profile">
      <Link
        href="/me"
        className="mb-5 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-fg-muted transition-colors duration-150 hover:text-fg"
      >
        {locale === "he" ? <ArrowRight aria-hidden className="size-4" /> : <ArrowLeft aria-hidden className="size-4" />}
        {t("backToMe")}
      </Link>
      <header className="grid gap-2">
        <MembersEyebrow />
        <h1 className="text-[clamp(1.875rem,6vw,2.5rem)] leading-[1.1] font-extrabold text-fg">{t("title")}</h1>
        <p className="max-w-[60ch] text-fg-muted">{t("body")}</p>
      </header>

      {!profile && (
        <p role="alert" className="mt-6 rounded-md border border-destructive/50 bg-destructive/10 px-3.5 py-3 text-fg">
          {t("errorGeneric")}
        </p>
      )}

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8">
        {/* ---------- Card: photo, how others see you, sign out ---------- */}
        <aside className={cn(raisedPanelClass, "grid gap-5 p-5 shadow-[var(--highlight-top)] sm:p-6 lg:sticky lg:top-8")}>
          <section aria-labelledby="photo-heading" className="grid gap-4">
            <h2 id="photo-heading" className="sr-only">
              {t("photo")}
            </h2>
            <div className="flex items-center gap-4 lg:flex-col lg:items-start">
              <MemberAvatar name={name} src={photoSrc} size={112} className="rounded-full ring-2 ring-brand-purple/40 ring-offset-2 ring-offset-surface" />
              <div className="min-w-0">
                <p className="text-lg leading-tight font-bold break-words text-fg">{name}</p>
                <ProfileSubline parts={subline} className="mt-1 text-sm text-fg-subtle" />
              </div>
            </div>
            <ActionForm action={uploadPhoto} resetOnSuccess className="grid gap-3">
              <label className={labelClass}>
                {t("photoPick")}
                <FilePicker name="photo" accept="image/*" required shrinkPhoto />
              </label>
              <p className={hintClass}>{t("photoHint")}</p>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn btn-primary h-10 px-4 text-sm">
                  {t("photoUpload")}
                </button>
              </div>
            </ActionForm>
            {profile?.photo_url && (
              <ActionForm action={removePhoto} confirmText={t("photoRemoveConfirm")}>
                <button type="submit" className={smallBtn}>
                  {t("photoRemove")}
                </button>
              </ActionForm>
            )}
          </section>
          <div className="grid gap-2 border-t border-border pt-5">
            <Link href={`/members/${viewer.member.id}`} className={cn(smallBtn, "w-full")}>
              <Eye aria-hidden />
              {t("viewPublic")}
            </Link>
            <SignOutButton className="h-10 w-full text-sm" />
          </div>
        </aside>

        {/* ---------- Details form ---------- */}
        <section aria-labelledby="details-heading" className={cn(raisedPanelClass, "p-5 shadow-[var(--highlight-top)] sm:p-6 lg:p-7")}>
          <h2 id="details-heading" className={panelTitle}>
            {t("details")}
          </h2>
          <ActionForm action={saveProfile} className="mt-5 grid gap-5">
            <label className={labelClass}>
              {t("fullName")}
              <input name="full_name" required maxLength={120} defaultValue={name} className={inputClass} autoComplete="name" />
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className={labelClass}>
                {t("year")}
                <select name="year" defaultValue={profile?.year ? String(profile.year) : ""} className={inputClass}>
                  <option value="">{t("yearNone")}</option>
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {t("yearN", { n: i + 1 })}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                {t("faculty")}
                <input name="faculty" maxLength={120} defaultValue={profile?.faculty ?? ""} className={inputClass} />
              </label>
            </div>
            <label className={labelClass}>
              {t("program")}
              <input name="program" maxLength={160} defaultValue={profile?.program ?? ""} className={inputClass} />
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className={labelClass}>
                {t("bioHe")}
                <textarea name="bio_he" dir="rtl" lang="he" maxLength={2000} defaultValue={profile?.bio_he ?? ""} className={textareaClass} />
              </label>
              <label className={labelClass}>
                {t("bioEn")}
                <textarea name="bio_en" dir="ltr" lang="en" maxLength={2000} defaultValue={profile?.bio_en ?? ""} className={textareaClass} />
              </label>
            </div>
            <fieldset className="grid gap-4 border-t border-border pt-5">
              <legend className="float-start mb-1 w-full text-base font-bold text-fg">{t("links")}</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ["linkedin", "https://www.linkedin.com/in/…"],
                    ["github", "https://github.com/…"],
                    ["website", "https://…"],
                  ] as const
                ).map(([key, placeholder]) => (
                  <label key={key} className={labelClass}>
                    {t(`link_${key}`)}
                    <input
                      name={key}
                      type="url"
                      dir="ltr"
                      inputMode="url"
                      placeholder={placeholder}
                      defaultValue={links[key] ?? ""}
                      className={`${inputClass} text-start`}
                    />
                  </label>
                ))}
              </div>
              <p className={hintClass}>{t("linksHint")}</p>
            </fieldset>
            {/* Private: stored in member_contacts, shown to members only per toggle (both off by default). */}
            <fieldset className="grid gap-4 border-t border-border pt-5" data-testid="contact-fields">
              <legend className="float-start mb-1 w-full text-base font-bold text-fg">{t("contactTitle")}</legend>
              <p className={hintClass}>{t("contactBody")}</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className={labelClass}>
                    {t("phone")}
                    <input
                      name="phone"
                      type="tel"
                      dir="ltr"
                      maxLength={24}
                      autoComplete="tel"
                      defaultValue={contact?.phone ?? ""}
                      className={`${inputClass} text-start`}
                    />
                  </label>
                  <ShareSwitch name="share_phone" defaultChecked={contact?.share_phone ?? false} label={t("sharePhone")} on={t("switchOn")} off={t("switchOff")} />
                </div>
                <div className="grid gap-2">
                  <label className={labelClass}>
                    {t("contactEmail")}
                    <input
                      name="contact_email"
                      type="email"
                      dir="ltr"
                      maxLength={254}
                      autoComplete="email"
                      defaultValue={contact?.contact_email ?? ""}
                      className={`${inputClass} text-start`}
                    />
                  </label>
                  <ShareSwitch name="share_email" defaultChecked={contact?.share_email ?? false} label={t("shareEmail")} on={t("switchOn")} off={t("switchOff")} />
                </div>
              </div>
              <p className="flex items-start gap-2.5 rounded-md border border-border bg-bg-deep/45 px-3.5 py-3 text-[0.875rem] text-fg-muted">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-purple-soft" />
                {t("privacyNote")}
              </p>
            </fieldset>
            <div className="border-t border-border pt-5">
              <button type="submit" className="btn btn-primary h-10 w-full px-6 text-sm sm:w-fit">
                {t("save")}
              </button>
            </div>
          </ActionForm>
        </section>
      </div>

      {supabase && <MyAttendance supabase={supabase} memberId={viewer.member.id} />}
    </div>
    </div>
  );
}

/**
 * "Show to members" as a switch. Still a real checkbox (same name, works without JS); the
 * track and the On/Off text follow it with CSS, so the state is written out, not colour only.
 */
function ShareSwitch({ name, defaultChecked, label, on, off }: { name: string; defaultChecked: boolean; label: string; on: string; off: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg-muted">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        aria-hidden
        className="flex h-6 w-10 shrink-0 items-center justify-start rounded-full border border-border-strong bg-bg-deep p-0.5 transition-colors duration-150 peer-checked:justify-end peer-checked:border-brand-purple peer-checked:bg-brand-purple peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-purple"
      >
        <span className="size-4 rounded-full bg-fg" />
      </span>
      <span className="grid gap-0.5">
        <span>{label}</span>
      </span>
      <span aria-hidden className="ms-auto text-[0.75rem] whitespace-nowrap text-fg-subtle peer-checked:hidden">
        {off}
      </span>
      <span aria-hidden className="ms-auto hidden text-[0.75rem] whitespace-nowrap text-brand-purple-soft peer-checked:inline">
        {on}
      </span>
    </label>
  );
}
