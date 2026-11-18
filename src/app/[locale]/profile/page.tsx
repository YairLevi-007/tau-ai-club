import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { signPhotos } from "@/lib/members/photos";
import { getMemberProfile, getMyContact } from "@/lib/members/profile";
import { MembersEyebrow } from "@/components/members/members-eyebrow";
import { ProfileEditor } from "@/components/members/profile-editor";
import { PageBackdrop } from "@/components/site/page-backdrop";
import { MyAttendance } from "@/components/members/my-attendance";

export async function generateMetadata({ params }: PageProps<"/[locale]/profile">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

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
  const name = profile?.full_name ?? viewer.member.fullName;

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

      <div className="mt-8">
        <ProfileEditor memberId={viewer.member.id} name={name} profile={profile} contact={contact} photoSrc={photoSrc} />
      </div>

      {supabase && <MyAttendance supabase={supabase} memberId={viewer.member.id} />}
    </div>
    </div>
  );
}
