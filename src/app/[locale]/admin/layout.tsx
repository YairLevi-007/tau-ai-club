import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/viewer";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { SignOutButton } from "@/components/auth/auth-buttons";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Admin area. Every page also calls requireAdmin() itself, and RLS checks every query. */
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  const viewer = await requireAdmin("/admin/members");
  const t = await getTranslations("admin");
  return (
    <div className="mx-auto grid max-w-site gap-8 px-4 pt-10 pb-16 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <AdminTabs
          label={t("navLabel")}
          tabs={[
            { href: "/admin/members", label: t("membersTab") },
            { href: "/admin/speakers", label: t("speakersTab") },
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
