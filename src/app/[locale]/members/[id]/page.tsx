import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { loc } from "@/lib/event-format";
import { signPhotos } from "@/lib/members/photos";
import { getMemberProfile, LINK_KEYS } from "@/lib/members/profile";
import { smallBtn } from "@/components/admin/styles";
import { MemberAvatar } from "@/components/members/member-avatar";

// Members only: no member's name goes into the title or any metadata.
export async function generateMetadata({ params }: PageProps<"/[locale]/members/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("memberTitle"), robots: { index: false, follow: false } };
}

/** Read-only profile of one member, for members. Guests sign in; outsiders get the members-only page. */
export default async function MemberPage({ params }: PageProps<"/[locale]/members/[id]">) {
  const { locale: l, id } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireMember(`/members/${id}`);
  const t = await getTranslations("profile");

  const supabase = await createClient();
  const profile = supabase ? await getMemberProfile(supabase, id) : null;
  if (!supabase || !profile) notFound();

  const photos = await signPhotos(supabase, [profile.photo_url]);
  const photoSrc = profile.photo_url ? (photos.get(profile.photo_url) ?? null) : null;
  const bio = loc(profile, "bio", locale);
  const links = LINK_KEYS.filter((k) => profile.links?.[k]);

  return (
    <article className="mx-auto grid max-w-3xl gap-8 px-4 pt-10 pb-16 sm:px-8" data-testid="member-profile">
      <header className="flex flex-wrap items-center gap-6">
        <MemberAvatar name={profile.full_name} src={photoSrc} size={128} />
        <div className="grid gap-2">
          <h1 className="text-h2 font-bold">{profile.full_name}</h1>
          {(profile.year || profile.faculty) && (
            <p className="text-fg-muted">
              {[profile.year ? t("yearN", { n: profile.year }) : null, profile.faculty].filter(Boolean).join(" · ")}
            </p>
          )}
          {profile.is_self && (
            <Link href="/profile" className={`${smallBtn} w-fit`}>
              {t("edit")}
            </Link>
          )}
        </div>
      </header>

      {bio ? (
        <p className="max-w-[65ch] whitespace-pre-line text-fg-muted">{bio}</p>
      ) : (
        <p className="text-fg-subtle">{t("noBio")}</p>
      )}

      {links.length > 0 && (
        <section aria-labelledby="links-heading" className="grid gap-3">
          <h2 id="links-heading" className="text-h3 font-bold">
            {t("links")}
          </h2>
          <ul className="flex flex-wrap gap-3">
            {links.map((k) => (
              <li key={k}>
                <a href={profile.links[k]} target="_blank" rel="noopener noreferrer nofollow" className={smallBtn}>
                  {t(`link_${k}`)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
