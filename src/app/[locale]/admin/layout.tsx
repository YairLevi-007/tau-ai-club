import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getViewer } from "@/lib/auth/viewer";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { SignOutButton } from "@/components/auth/auth-buttons";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Admin area chrome. The guard lives in each page (requireAdmin with its own path, so
 * sign-in returns to the right page); RLS checks every query. Non-admins never see
 * the chrome: their page redirects or 404s.
 */
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  const viewer = await getViewer();
  if (viewer.kind !== "member" || viewer.member.role !== "admin") return children;
  const t = await getTranslations("admin");
  return (
    <div className="mx-auto grid max-w-site gap-8 px-4 pt-10 pb-16 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <AdminTabs
          label={t("navLabel")}
          tabs={[
            { href: "/admin/events", label: t("eventsTab") },
            { href: "/admin/venues", label: t("venuesTab") },
            { href: "/admin/speaker-profiles", label: t("speakerProfilesTab") },
            { href: "/admin/speakers", label: t("speakersTab") },
            { href: "/admin/members", label: t("membersTab") },
          ]}
        />
        <div className="flex items-center gap-3 text-sm text-fg-subtle">
          <bdi dir="ltr">{viewer.email}</bdi>
          <SignOutButton />
        </div>
      </div>
      {children}
    </div>
  );
}
