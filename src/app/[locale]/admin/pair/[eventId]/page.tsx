import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight, Check, Megaphone, Shuffle, Sparkles, TriangleAlert, Undo2, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TIME_ZONE, type Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { formatShortDate, loc } from "@/lib/event-format";
import { signPhotos } from "@/lib/members/photos";
import { getPairAdminData, UUID, type PairEvent, type PairPerson } from "@/lib/pair/data";
import { groupState, history, pairKey, repeatCount } from "@/lib/pair/match";
import { groupCommon } from "@/lib/pair/common";
import { ActionForm } from "@/components/admin/action-form";
import { AdminHeader } from "@/components/admin/admin-header";
import { dangerBtn, hintClass, panelClass, panelTitle, smallBtn } from "@/components/admin/styles";
import { BidiText } from "@/components/events/bidi-text";
import { MemberAvatar } from "@/components/members/member-avatar";
import { ProfileSubline } from "@/components/members/profile-subline";
import { CommonChips, GroupStateChip, PairChip, PairNum } from "@/components/pair/pair-bits";
import { PeoplePicker } from "@/components/pair/people-picker";
import { CopyTextButton } from "@/components/pair/copy-text-button";
import { cn } from "@/lib/utils";
import { deleteRound, generateGroups, markGroup, openRound, publishRound, savePeople } from "../actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/pair/[eventId]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pair" });
  return { title: t("roundTitle"), robots: { index: false, follow: false } };
}

/**
 * One meetup's pairing, pAIr's meeting screen: 01 who is coming (from Luma, editable), 02 the
 * conversations (create, re-shuffle, copy for WhatsApp, lock and publish), and after publishing,
 * who confirmed each conversation plus the admin's own met / missed marks.
 */
export default async function AdminPairRoundPage({ params }: PageProps<"/[locale]/admin/pair/[eventId]">) {
  const { locale: l, eventId } = await params;
  const locale = l as Locale;
  setRequestLocale(locale);
  await requireAdmin(`/admin/pair/${eventId}`);
  if (!UUID.test(eventId)) notFound();
  const [t, tp] = await Promise.all([getTranslations("pair"), getTranslations("profile")]);
  const supabase = await createClient();
  if (!supabase) notFound();

  const [{ data: ev }, { data: att }, data] = await Promise.all([
    supabase.from("events").select("id, slug, title_he, title_en, starts_at, ends_at").eq("id", eventId).maybeSingle(),
    supabase.from("attendance").select("member_id, status").eq("event_id", eventId),
    getPairAdminData(supabase),
  ]);
  const event = ev as PairEvent | null;
  if (!event) notFound();
  const lumaIds = new Set(((att ?? []) as { member_id: string; status: string }[]).filter((a) => a.status !== "no_show").map((a) => a.member_id));
  const round = data.rounds.find((r) => r.event.id === eventId) ?? null;
  const persons = data.persons;
  const title = loc(event, "title", locale) ?? event.slug;
  const Back = locale === "he" ? ArrowRight : ArrowLeft;
  const back = (
    <Link href="/admin/pair" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
      <Back aria-hidden className="size-4" />
      {t("backToMeetups")}
    </Link>
  );

  if (!round) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <AdminHeader before={back} title={<BidiText text={title} />} meta={<bdi>{formatShortDate(event.starts_at, locale)}</bdi>} />
        <section className={cn(panelClass, "grid gap-3 p-5 sm:p-6")}>
          <h2 className={panelTitle}>{t("openTitle")}</h2>
          <p className="max-w-[65ch] text-fg-muted">{t("openBody", { n: [...lumaIds].filter((id) => persons.has(id)).length })}</p>
          <ActionForm action={openRound} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="event_id" value={event.id} />
            <button type="submit" className="btn btn-primary h-11 px-4">
              <Sparkles aria-hidden />
              {t("openButton")}
            </button>
          </ActionForm>
        </section>
      </div>
    );
  }

  const published = round.status === "published";
  const hist = history(data.rounds, round.id);
  const person = (id: string): PairPerson | null => persons.get(id) ?? null;
  const name = (id: string) => person(id)?.full_name ?? t("removedPerson");
  // Everyone active, plus anyone on the list who is no longer active (so they can be removed).
  const pickerIds = [...new Set([...persons.keys(), ...round.people.keys()])];
  const allPhotos = await signPhotos(supabase, [...persons.values()].map((p) => p.photo_url));
  const photo = (id: string) => {
    const url = person(id)?.photo_url;
    return url ? (allPhotos.get(url) ?? null) : null;
  };
  const collator = new Intl.Collator(locale);
  const people = pickerIds
    .map((id) => ({ id, name: name(id), photoSrc: photo(id), luma: lumaIds.has(id), checked: round.people.has(id) }))
    .sort((a, b) => collator.compare(a.name, b.name));

  const groups = round.groups;
  const repeats = repeatCount(
    groups.map((g) => g.members),
    hist,
  );
  const date = formatShortDate(event.starts_at, locale);
  const stamp = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const lastDate = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });

  const commonFor = (ids: string[]) => {
    const list = ids.map(person).filter((p): p is PairPerson => Boolean(p));
    return groupCommon(list);
  };
  // The WhatsApp text, as pAIr wrote it.
  const copyText = [
    t("copyHeading", { title, date }),
    "",
    ...groups.map((g, i) => {
      const c = commonFor(g.members);
      const note = c.all.length
        ? `  (${t("copyCommon", { items: c.all.join(", ") })})`
        : c.pairs.length
          ? `  (${c.pairs.map((x) => `${x.a.full_name}${t("and")}${x.b.full_name}: ${x.items.join(", ")}`).join(" | ")})`
          : "";
      return `${i + 1}. ${g.members.map(name).join(" ↔ ")}${note}`;
    }),
  ].join("\n");

  const stateLabels = { met: t("stateMet"), partial: t("statePartial"), missed: t("stateMissed"), pending: t("statePending"), manual: t("stateManual") };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6" data-testid="admin-pair-round">
      <AdminHeader
        before={back}
        title={<BidiText text={title} />}
        meta={<bdi>{date}</bdi>}
        action={<PairChip tone={published ? "ok" : "warn"}>{published ? t("statusPublishedLong") : t("statusDraftLong")}</PairChip>}
        alert={data.error ? t("errorLoad") : null}
      />

      {/* 01 · who is coming */}
      <section aria-labelledby="pair-people" className={cn(panelClass, "grid gap-4 p-5 sm:p-6")}>
        <h2 id="pair-people" className={cn(panelTitle, "flex items-center gap-2.5")}>
          <PairNum n={1} />
          {t("peopleTitle")}
        </h2>
        <p className={hintClass}>{published ? t("peopleLocked") : t("peopleHint")}</p>
        <ActionForm action={savePeople} className="grid gap-4">
          <input type="hidden" name="round_id" value={round.id} />
          <PeoplePicker
            people={people}
            disabled={published}
            labels={{ all: t("peopleAll"), none: t("peopleNone"), count: t.raw("peopleCount") as string, luma: t("fromLuma") }}
          />
          {!published && (
            <button type="submit" className="btn btn-primary h-11 w-fit px-4">
              {t("peopleSave")}
            </button>
          )}
        </ActionForm>
      </section>

      {/* 02 · the conversations */}
      <section
        aria-labelledby="pair-groups"
        className={cn(panelClass, "grid gap-4 p-5 sm:p-6", groups.length > 0 && repeats === 0 && "border-border-accent shadow-[var(--glow-featured)]")}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="pair-groups" className={cn(panelTitle, "flex items-center gap-2.5")}>
            <PairNum n={2} />
            {t("groupsTitle")}
          </h2>
          <div className="flex flex-wrap items-start gap-2">
            {!published && (
              <ActionForm action={generateGroups} className="grid gap-2">
                <input type="hidden" name="round_id" value={round.id} />
                <button type="submit" className={groups.length ? smallBtn : "btn btn-primary h-10 px-3.5 text-sm"} disabled={round.people.size < 2}>
                  {groups.length ? <Shuffle aria-hidden /> : <Sparkles aria-hidden />}
                  {groups.length ? t("regenerate") : t("generate")}
                </button>
              </ActionForm>
            )}
            {groups.length > 0 && <CopyTextButton text={copyText} labels={{ copy: t("copy"), copied: t("copied"), manual: t("copyManual") }} />}
            {groups.length > 0 && (
              <ActionForm action={publishRound} className="grid gap-2" confirmText={published ? t("unpublishConfirm") : undefined}>
                <input type="hidden" name="round_id" value={round.id} />
                <input type="hidden" name="publish" value={published ? "0" : "1"} />
                <button type="submit" className={published ? smallBtn : "btn btn-primary h-10 px-3.5 text-sm"}>
                  {published ? <Undo2 aria-hidden /> : <Megaphone aria-hidden />}
                  {published ? t("unpublish") : t("publish")}
                </button>
              </ActionForm>
            )}
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="text-fg-muted">{round.people.size < 2 ? t("needTwo") : t("groupsEmpty")}</p>
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              {t("groupsCount", { n: groups.length })} ·{" "}
              {repeats ? <b className="font-semibold text-fg">{t("repeats", { n: repeats })}</b> : <b className="font-semibold text-brand-purple-soft">{t("noRepeats")}</b>}
            </p>
            <ol className="grid gap-3">
              {groups.map((g, gi) => {
                const st = published ? groupState(round, g) : null;
                const reps: string[] = [];
                for (let i = 0; i < g.members.length; i++)
                  for (let j = i + 1; j < g.members.length; j++) {
                    const k = pairKey(g.members[i], g.members[j]);
                    const c = hist.counts.get(k);
                    if (c)
                      reps.push(
                        t("repeatLine", { a: name(g.members[i]), b: name(g.members[j]), n: c, last: lastDate.format(new Date(hist.last.get(k) ?? event.starts_at)) }),
                      );
                  }
                const common = commonFor(g.members);
                return (
                  <li
                    key={g.id}
                    className={cn("grid gap-3 rounded-md border border-border bg-bg-deep/45 p-4", st === "missed" && "opacity-60")}
                    data-testid="pair-group"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <PairNum n={gi + 1} />
                      {g.members.length === 3 && <PairChip>{t("trio")}</PairChip>}
                      {st && (
                        <span className="ms-auto">
                          <GroupStateChip state={st} manual={g.mark === "met"} labels={stateLabels} />
                        </span>
                      )}
                    </div>
                    <div className="grid gap-3 md:grid-flow-col md:auto-cols-fr">
                      {g.members.map((id) => {
                        const p = person(id);
                        const bio = p ? loc(p, "bio", locale) : null;
                        return (
                          <div key={id} className="flex min-w-0 items-start gap-3">
                            <MemberAvatar name={name(id)} src={photo(id)} size={44} />
                            <div className="grid min-w-0 gap-0.5">
                              <span className="font-semibold text-fg">{name(id)}</span>
                              {p && <ProfileSubline parts={[p.year ? tp("yearN", { n: p.year }) : null, p.faculty, p.program]} className="text-xs text-fg-subtle" />}
                              {bio && <p className="line-clamp-3 text-sm text-fg-muted">{bio}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {reps.length > 0 && (
                      <p className="flex items-start gap-2 text-sm text-fg">
                        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-purple-soft" />
                        <span>{reps.join(" · ")}</span>
                      </p>
                    )}
                    {common.all.length ? (
                      <CommonChips items={common.all} label={t("inCommon")} />
                    ) : common.pairs.length ? (
                      common.pairs.map((pc) => <CommonChips key={pc.a.id + pc.b.id} items={pc.items} label={`${pc.a.full_name}${t("and")}${pc.b.full_name}:`} />)
                    ) : (
                      <p className="text-sm text-fg-subtle">{t("nothingInCommon")}</p>
                    )}
                    {published && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3 text-sm">
                        {g.members.map((id) => {
                          const at = round.confirms.get(id);
                          return (
                            <span key={id} className={at ? "text-fg" : "text-fg-subtle"}>
                              {at ? (
                                <>
                                  <Check aria-hidden className="inline size-4 text-brand-purple-soft" /> {t("confirmedBy", { name: name(id) })} ·{" "}
                                  <bdi dir="ltr" className="font-mono text-xs">
                                    {stamp.format(new Date(at))}
                                  </bdi>
                                </>
                              ) : (
                                t("waitingFor", { name: name(id) })
                              )}
                            </span>
                          );
                        })}
                        <span className="ms-auto flex flex-wrap gap-2">
                          {g.mark !== "met" && <MarkButton groupId={g.id} mark="met" label={t("markMet")} icon={<Check aria-hidden />} />}
                          {g.mark !== "missed" && <MarkButton groupId={g.id} mark="missed" label={t("markMissed")} icon={<X aria-hidden />} danger />}
                          {g.mark && <MarkButton groupId={g.id} mark="" label={t("markAuto")} icon={<Undo2 aria-hidden />} />}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {!published && <p className={hintClass}>{t("publishHint")}</p>}
          </>
        )}
      </section>

      <ActionForm action={deleteRound} confirmText={t("deleteConfirm")} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="round_id" value={round.id} />
        <button type="submit" className={dangerBtn}>
          {t("deleteRound")}
        </button>
        <span className={hintClass}>{t("deleteHint")}</span>
      </ActionForm>
    </div>
  );
}

function MarkButton({ groupId, mark, label, icon, danger }: { groupId: string; mark: string; label: string; icon: React.ReactNode; danger?: boolean }) {
  return (
    <ActionForm action={markGroup} className="contents">
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="mark" value={mark} />
      <button type="submit" className={cn(danger ? dangerBtn : smallBtn, "h-9")}>
        {icon}
        {label}
      </button>
    </ActionForm>
  );
}
