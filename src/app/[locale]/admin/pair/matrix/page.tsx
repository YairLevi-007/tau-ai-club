import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { getPairAdminData } from "@/lib/pair/data";
import { history, pairKey } from "@/lib/pair/match";
import { AdminHeader } from "@/components/admin/admin-header";
import { panelClass, panelTitle } from "@/components/admin/styles";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/pair/matrix">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pair" });
  return { title: t("matrixTitle"), robots: { index: false, follow: false } };
}

/**
 * pAIr's "who met who": a member × member grid (✓ met once, a number for more), and for each
 * member the people they haven't met yet. Only confirmed conversations count.
 */
export default async function AdminPairMatrixPage({ params }: PageProps<"/[locale]/admin/pair/matrix">) {
  const { locale: l } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin("/admin/pair/matrix");
  const t = await getTranslations("pair");
  const supabase = await createClient();
  const data = supabase ? await getPairAdminData(supabase) : null;
  const collator = new Intl.Collator(locale);
  const act = [...(data?.persons.values() ?? [])].sort((a, b) => collator.compare(a.full_name, b.full_name));
  const hist = history(data?.rounds ?? []);
  const count = (a: string, b: string) => hist.counts.get(pairKey(a, b)) ?? 0;
  const first = (n: string) => n.split(/\s+/)[0];
  const Back = locale === "he" ? ArrowRight : ArrowLeft;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6" data-testid="admin-pair-matrix">
      <AdminHeader
        before={
          <Link href="/admin/pair" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
            <Back aria-hidden className="size-4" />
            {t("backToMeetups")}
          </Link>
        }
        title={t("matrixTitle")}
        body={t("matrixBody")}
        alert={data?.error ? t("errorLoad") : null}
      />
      {act.length < 2 ? (
        <p className="text-fg-muted">{t("matrixEmpty")}</p>
      ) : (
        <>
          <div className={cn(panelClass, "overflow-x-auto overscroll-x-contain")}>
            <table className="border-separate border-spacing-0 text-sm" data-testid="pair-matrix">
              <caption className="sr-only">{t("matrixCaption")}</caption>
              <thead>
                <tr>
                  <td className="sticky start-0 z-10 border-b border-border bg-bg [background-image:linear-gradient(var(--surface),var(--surface))]" />
                  {act.map((p) => (
                    <th key={p.id} scope="col" title={p.full_name} className="border-b border-border px-2 py-2.5 text-xs font-medium whitespace-nowrap text-fg-subtle">
                      {first(p.full_name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {act.map((r) => (
                  <tr key={r.id}>
                    <th
                      scope="row"
                      className="sticky start-0 z-10 border-b border-border bg-bg [background-image:linear-gradient(var(--surface),var(--surface))] px-3 py-2 text-start font-medium whitespace-nowrap text-fg"
                    >
                      {r.full_name}
                    </th>
                    {act.map((c) => {
                      if (r.id === c.id) return <td key={c.id} className="border-b border-border bg-bg-deep" aria-hidden />;
                      const k = count(r.id, c.id);
                      const label = k ? t("matrixCell", { a: r.full_name, b: c.full_name, n: k }) : t("matrixCellNot", { a: r.full_name, b: c.full_name });
                      return (
                        <td key={c.id} title={label} className={cn("border-b border-border px-2 py-2 text-center font-mono", k > 1 ? "bg-brand-purple text-on-purple" : k ? "bg-brand-purple/25 text-fg" : "")}>
                          <span aria-hidden>{k > 1 ? k : k ? "✓" : ""}</span>
                          <span className="sr-only">{label}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section aria-labelledby="pair-not-met" className={cn(panelClass, "grid gap-4 p-5 sm:p-6")}>
            <h2 id="pair-not-met" className={panelTitle}>
              {t("notMetTitle")}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {act.map((p) => {
                const left = act.filter((o) => o.id !== p.id && !count(p.id, o.id));
                return (
                  <li key={p.id} className="text-sm">
                    <b className="font-semibold text-fg">{p.full_name}</b>{" "}
                    <bdi className="font-mono text-fg-subtle">({left.length})</bdi>
                    <br />
                    {left.length ? <span className="text-fg-muted">{left.map((o) => o.full_name).join(", ")}</span> : <span className="text-brand-purple-soft">{t("metEveryone")}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
