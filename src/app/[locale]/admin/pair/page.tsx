import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, ChevronRight, Grid3x3 } from "lucide-react";
import { Link } from "@/components/pair/site-nav";
import { TIME_ZONE, type Locale, formatShortDate, loc, AdminHeader, hintClass, panelClass, panelTitle, smallBtn, BidiText, MemberAvatar, cn } from "@/components/pair/site-ui";
import { requireAdmin, createClient, currentCohort, signPhotos } from "@/lib/pair/site";
import { getPairAdminData, getSeasonEvents } from "@/lib/pair/data";
import { groupState, history, pairKey } from "@/lib/pair/match";
import { PairChip } from "@/components/pair/pair-bits";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/pair">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pair" });
  return { title: t("adminTitle"), robots: { index: false, follow: false } };
}

/**
 * pAIr's "meetings" screen: every meetup of the season with its pairing status, the season's
 * progress (pairs who met), and the latest "the meeting happened" confirmations from members.
 */
export default async function AdminPairPage({ params }: PageProps<"/[locale]/admin/pair">) {
  const { locale: l } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin("/admin/pair");
  const t = await getTranslations("pair");
  const supabase = await createClient();
  const cohort = supabase ? await currentCohort(supabase) : null;
  const [data, season] = supabase
    ? await Promise.all([getPairAdminData(supabase), cohort ? getSeasonEvents(supabase, cohort.id) : Promise.resolve({ events: [], error: false })])
    : [null, null];

  const rounds = data?.rounds ?? [];
  const persons = data?.persons ?? new Map();
  const roundByEvent = new Map(rounds.map((r) => [r.event.id, r]));
  const hist = history(rounds);
  const active = [...persons.values()];
  const total = (active.length * (active.length - 1)) / 2;
  let met = 0;
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) if (hist.counts.get(pairKey(active[i].id, active[j].id))) met++;
  const pct = total ? Math.round((met / total) * 100) : 0;

  // Latest confirmations (pAIr's "updates from members").
  const feed = rounds
    .filter((r) => r.status === "published")
    .flatMap((r) =>
      [...r.confirms.entries()].map(([memberId, at]) => {
        const g = r.groups.find((x) => x.members.includes(memberId));
        return { r, memberId, at, partners: (g?.members ?? []).filter((x) => x !== memberId) };
      }),
    )
    .filter((e) => persons.has(e.memberId))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);
  const photos = supabase ? await signPhotos(supabase, feed.map((e) => persons.get(e.memberId)?.photo_url)) : new Map<string, string>();
  const name = (id: string) => persons.get(id)?.full_name ?? t("removedPerson");
  const stamp = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const Forward = locale === "he" ? ChevronLeft : ChevronRight;
  const events = season?.events ?? [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6" data-testid="admin-pair">
      <AdminHeader
        title={t("adminTitle")}
        body={t("adminBody")}
        alert={data?.error || season?.error ? t("errorLoad") : null}
        action={
          <Link href="/admin/pair/matrix" className={smallBtn}>
            <Grid3x3 aria-hidden />
            {t("matrixLink")}
          </Link>
        }
      />

      {active.length >= 2 && (
        <section aria-labelledby="pair-progress" className={cn(panelClass, "grid gap-3 p-5 sm:p-6")}>
          <h2 id="pair-progress" className="sr-only">
            {t("progressTitle")}
          </h2>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="grid gap-1">
              <span className="font-mono text-[2rem] leading-none font-bold text-fg">
                <bdi dir="ltr">
                  {met}
                  <span className="text-xl text-fg-subtle">/{total}</span>
                </bdi>
              </span>
              <span className="text-sm text-fg-muted">{t("pairsMet")}</span>
            </p>
            <p className="grid gap-1 text-end">
              <bdi dir="ltr" className="font-mono text-[2rem] leading-none font-bold text-brand-purple-soft">
                {pct}%
              </bdi>
              <span className="text-sm text-fg-muted">{met === total ? t("everyoneMet") : t("roundsLeft", { n: Math.max(0, active.length - 1 - Math.floor((met * 2) / active.length)) })}</span>
            </p>
          </div>
          <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-border">
            <span className="block h-full rounded-full bg-brand-purple" style={{ width: `${pct}%` }} />
          </span>
        </section>
      )}

      {feed.length > 0 && (
        <section aria-labelledby="pair-feed" className={cn(panelClass, "grid gap-3 p-5 sm:p-6")} data-testid="pair-feed">
          <h2 id="pair-feed" className={panelTitle}>
            {t("feedTitle")}
          </h2>
          <ul className="grid gap-2.5">
            {feed.map((e) => {
              const who = persons.get(e.memberId)!;
              return (
                <li key={`${e.r.id}:${e.memberId}`} className="flex items-center gap-3 text-sm">
                  <MemberAvatar name={who.full_name} src={who.photo_url ? (photos.get(who.photo_url) ?? null) : null} size={32} />
                  <p className="min-w-0 flex-1 text-fg-muted">
                    {t.rich(e.partners.length ? "feedLineWith" : "feedLine", {
                      who: who.full_name,
                      partners: e.partners.map(name).join(t("and")),
                      b: (c) => <b className="font-semibold text-fg">{c}</b>,
                    })}{" "}
                    ·{" "}
                    <Link href={`/admin/pair/${e.r.event.id}`} className="text-brand-purple-soft underline-offset-4 hover:underline">
                      <BidiText text={loc(e.r.event, "title", locale) ?? e.r.event.slug} />
                    </Link>
                  </p>
                  <bdi dir="ltr" className="shrink-0 font-mono text-xs text-fg-subtle">
                    {stamp.format(new Date(e.at))}
                  </bdi>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="pair-meetups" className="grid gap-3">
        <h2 id="pair-meetups" className={panelTitle}>
          {t("meetupsTitle")}
        </h2>
        {events.length === 0 ? (
          <p className="text-fg-muted">{t("meetupsEmpty")}</p>
        ) : (
          <ul className="grid gap-2.5">
            {events.map((e) => {
              const r = roundByEvent.get(e.id);
              const metCount = r ? r.groups.filter((g) => groupState(r, g) === "met").length : 0;
              return (
                <li key={e.id}>
                  <Link
                    href={`/admin/pair/${e.id}`}
                    className={cn(panelClass, "group flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors duration-150 hover:border-border-accent hover:bg-surface-hover")}
                    data-testid="pair-meetup"
                  >
                    <bdi className="w-14 shrink-0 font-mono text-sm text-fg-muted">{formatShortDate(e.starts_at, locale)}</bdi>
                    <span className="min-w-0 flex-1 font-semibold text-fg">
                      <BidiText text={loc(e, "title", locale) ?? e.slug} />
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                      {r ? (
                        <>
                          <span>{t("meetupCounts", { people: r.people.size, groups: r.groups.length })}</span>
                          {r.status === "published" && r.groups.length > 0 && <span>· {t("meetupMet", { met: metCount, total: r.groups.length })}</span>}
                          <PairChip tone={r.status === "published" ? "ok" : "warn"}>{r.status === "published" ? t("statusPublished") : t("statusDraft")}</PairChip>
                        </>
                      ) : (
                        <PairChip>{t("statusNone")}</PairChip>
                      )}
                      <Forward aria-hidden className="size-5 text-fg-subtle transition-colors group-hover:text-brand-purple-soft" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className={hintClass}>{t("meetupsHint")}</p>
      </section>
    </div>
  );
}
