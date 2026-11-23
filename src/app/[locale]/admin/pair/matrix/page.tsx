import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/components/pair/site-nav";
import { type Locale, AdminHeader, panelClass, panelTitle, cn } from "@/components/pair/site-ui";
import { requireAdmin, createClient } from "@/lib/pair/site";
import { getPairAdminData } from "@/lib/pair/data";
import { history, pairKey } from "@/lib/pair/match";
import { PairMatrix } from "@/components/pair/pair-matrix";

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
          {/* Phones: one line per member instead of a grid that scrolls sideways (DECISIONS 23.11). */}
          <section aria-labelledby="pair-met" className={cn(panelClass, "grid gap-4 p-5 sm:hidden")} data-testid="pair-matrix-list">
            <h2 id="pair-met" className={panelTitle}>
              {t("metTitle")}
            </h2>
            <ul className="grid gap-3">
              {act.map((p) => {
                const met = act.filter((o) => o.id !== p.id && count(p.id, o.id));
                return (
                  <li key={p.id} className="text-sm">
                    <b className="font-semibold text-fg">{p.full_name}</b>{" "}
                    <bdi className="font-mono text-fg-subtle">({met.length})</bdi>
                    <br />
                    {met.length ? (
                      <span className="text-fg-muted">
                        {met.map((o) => (count(p.id, o.id) > 1 ? `${o.full_name} ×${count(p.id, o.id)}` : o.full_name)).join(", ")}
                      </span>
                    ) : (
                      <span className="text-fg-subtle">{t("metNobody")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <PairMatrix
            people={act}
            count={count}
            labels={{
              caption: t("matrixCaption"),
              cell: (a, b, n) => t("matrixCell", { a, b, n }),
              cellNot: (a, b) => t("matrixCellNot", { a, b }),
            }}
          />

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
