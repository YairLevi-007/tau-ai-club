import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/members/photos";
import { getMemberProfile } from "@/lib/members/profile";
import { ActionForm } from "@/components/admin/action-form";
import { inputClass, labelClass, smallBtn } from "@/components/admin/styles";
import { MemberAvatar } from "@/components/members/member-avatar";
import { SignOutButton } from "@/components/auth/auth-buttons";
import { removePhoto, saveProfile, uploadPhoto } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/profile">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const textareaClass = inputClass.replace("h-10", "min-h-28 py-2");

/** The signed-in member edits their own profile. RLS allows writes to their own row only. */
export default async function ProfilePage({ params }: PageProps<"/[locale]/profile">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const viewer = await requireMember("/profile");
  const t = await getTranslations("profile");

  const supabase = await createClient();
  const profile = supabase ? await getMemberProfile(supabase, viewer.member.id) : null;
  const photos = supabase && profile ? await signPhotos(supabase, [profile.photo_url]) : new Map<string, string>();
  const photoSrc = profile?.photo_url ? (photos.get(profile.photo_url) ?? null) : null;
  const links = profile?.links ?? {};

  return (
    <div className="mx-auto grid max-w-3xl gap-10 px-4 pt-10 pb-16 sm:px-8" data-testid="profile">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <h1 className="text-h2 font-bold">{t("title")}</h1>
          <p className="max-w-[65ch] text-fg-muted">{t("body")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={`/members/${viewer.member.id}`} className={smallBtn}>
            {t("viewPublic")}
          </Link>
          <SignOutButton />
        </div>
      </header>

      {!profile && (
        <p role="alert" className="text-destructive">
          {t("errorGeneric")}
        </p>
      )}

      <section aria-labelledby="photo-heading" className="grid gap-4">
        <h2 id="photo-heading" className="text-h3 font-bold">
          {t("photo")}
        </h2>
        <div className="flex flex-wrap items-start gap-6">
          <MemberAvatar name={profile?.full_name ?? viewer.member.fullName} src={photoSrc} size={112} />
          <div className="grid gap-3">
            <ActionForm action={uploadPhoto} resetOnSuccess className="flex flex-wrap items-end gap-3">
              <label className={labelClass}>
                {t("photoPick")}
                <input
                  type="file"
                  name="photo"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  className="text-sm text-fg-muted file:me-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-fg"
                />
              </label>
              <button type="submit" className="btn btn-primary h-10 px-4 text-sm">
                {t("photoUpload")}
              </button>
            </ActionForm>
            <p className="text-sm text-fg-subtle">{t("photoHint")}</p>
            {profile?.photo_url && (
              <ActionForm action={removePhoto} confirmText={t("photoRemoveConfirm")}>
                <button type="submit" className={smallBtn}>
                  {t("photoRemove")}
                </button>
              </ActionForm>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="details-heading" className="grid gap-4">
        <h2 id="details-heading" className="text-h3 font-bold">
          {t("details")}
        </h2>
        <ActionForm action={saveProfile} className="grid gap-5">
          <label className={labelClass}>
            {t("fullName")}
            <input name="full_name" required maxLength={120} defaultValue={profile?.full_name ?? viewer.member.fullName} className={inputClass} autoComplete="name" />
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
            {t("bioHe")}
            <textarea name="bio_he" dir="rtl" lang="he" maxLength={2000} defaultValue={profile?.bio_he ?? ""} className={textareaClass} />
          </label>
          <label className={labelClass}>
            {t("bioEn")}
            <textarea name="bio_en" dir="ltr" lang="en" maxLength={2000} defaultValue={profile?.bio_en ?? ""} className={textareaClass} />
          </label>
          <fieldset className="grid gap-4">
            <legend className="mb-2 text-sm font-medium text-fg">{t("links")}</legend>
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
            <p className="text-sm text-fg-subtle">{t("linksHint")}</p>
          </fieldset>
          <div>
            <button type="submit" className="btn btn-primary h-10 px-5 text-sm">
              {t("save")}
            </button>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
