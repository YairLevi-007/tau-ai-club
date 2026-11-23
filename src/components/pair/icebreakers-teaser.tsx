import { getTranslations } from "next-intl/server";
import { Lightbulb } from "lucide-react";
import { Link } from "@/components/pair/site-nav";
import { TIME_ZONE, type Locale, formatShortDate, loc, cn, BidiText, MemberAvatar, ProfileSubline, LinkedInIcon, FlyerChip } from "@/components/pair/site-ui";
import { commonInterests, type PairProfileText } from "@/lib/pair/common";
import type { MyMatch } from "@/lib/pair/data";
import { CommonChips } from "@/components/pair/pair-bits";
import { ConfirmMeet } from "@/components/pair/confirm-meet";

/**
 * The meeting games card in /me (DECISIONS 18.11: the big card with the two seats, title
 * "משחקי היכרות לחברי המועדון").
 *
 * With no published conversation it is the teaser as approved: no button, no link, no motion, a
 * dashed border as the "not here yet" cue and a chip that says it in words. Once an admin publishes
 * a pAIr round, the same card shows the member's partner for the newest meetup (the seats get
 * their faces), what they have in common or an opening question, and "the meeting happened";
 * earlier meetups fold away below. Server-rendered; only the confirm button needs JS.
 */
export async function IcebreakersTeaser({
  locale,
  embedded = false,
  matches = [],
  me,
  photos,
}: {
  locale: Locale;
  embedded?: boolean;
  /** The member's published conversations, newest first (my_pair_matches()). */
  matches?: MyMatch[];
  /** The viewer: name, photo and profile text, for the seats and "in common". */
  me?: PairProfileText & { name: string; photoSrc: string | null };
  /** Signed photo URLs, keyed by the stored photo_url. */
  photos?: Map<string, string>;
}) {
  const t = await getTranslations({ locale, namespace: "home" });
  const latest = embedded ? matches[0] : undefined;
  if (latest && me) return <MatchCard locale={locale} matches={matches} me={me} photos={photos ?? new Map()} />;
  return (
    <section
      aria-labelledby="icebreakers-heading"
      data-testid={embedded ? "me-game-slot" : "icebreakers-teaser"}
      className={embedded ? undefined : "mx-auto max-w-site px-4 pt-12 sm:px-8 lg:pt-16"}
    >
      <div className={embedded ? undefined : "sm:px-8"}>
        <div className="grid items-center gap-6 rounded-lg border-[1.5px] border-dashed border-border-strong bg-bg-deep px-5 py-6 md:grid-cols-[1fr_auto] md:gap-12 md:px-10 md:py-9">
          <div>
            <FlyerChip locale={locale}>{t("icebreakersSoon")}</FlyerChip>
            <h2
              id="icebreakers-heading"
              className={cn(
                "mt-3.5 text-[clamp(1.625rem,4vw,2.25rem)] leading-[1.1] tracking-[-0.01em] text-balance text-fg",
                locale === "he" ? "font-extrabold" : "font-bold",
              )}
            >
              {t("icebreakersTitle")}
            </h2>
            <p className="mt-2 max-w-[52ch] text-fg-muted">{t("icebreakersBody")}</p>
          </div>
          <PairMotif />
        </div>
      </div>
    </section>
  );
}

async function MatchCard({
  locale,
  matches,
  me,
  photos,
}: {
  locale: Locale;
  matches: MyMatch[];
  me: PairProfileText & { name: string; photoSrc: string | null };
  photos: Map<string, string>;
}) {
  const [t, th, tp] = await Promise.all([
    getTranslations({ locale, namespace: "pair" }),
    getTranslations({ locale, namespace: "home" }),
    getTranslations({ locale, namespace: "profile" }),
  ]);
  const [m, ...rest] = matches;
  const photo = (url: string | null) => (url ? (photos.get(url) ?? null) : null);
  const partners = m.partners.map((p) => ({ ...p, common: commonInterests([me, p]) }));
  const trio = partners.length > 1;
  const title = loc(m, "title", locale) ?? m.slug;
  // pAIr's tip: start from something in common, otherwise an opening question (fixed per meetup).
  const firstCommon = partners.find((p) => p.common.length)?.common[0];
  const questions = t.raw("icebreakers") as string[];
  const hash = [...m.round_id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const stamp = new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const labels = {
    confirm: t("confirm"),
    confirmed: t("confirmedByMe"),
    undo: t("undo"),
    hint: t("confirmHint"),
    thanks: t("confirmThanks"),
    failed: t("confirmFailed"),
    done: t("stateMet"),
  };

  return (
    <section aria-labelledby="icebreakers-heading" data-testid="me-game-slot">
      <div className="grid gap-6 rounded-lg border-[1.5px] border-border-accent bg-bg-deep px-5 py-6 shadow-[var(--glow-featured)] md:px-10 md:py-9" data-testid="pair-match">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto] md:gap-12">
          <div>
            <FlyerChip locale={locale}>{trio ? t("trioChat") : t("oneOnOne")}</FlyerChip>
            <h2
              id="icebreakers-heading"
              className={cn(
                "mt-3.5 text-[clamp(1.625rem,4vw,2.25rem)] leading-[1.1] tracking-[-0.01em] text-balance text-fg",
                locale === "he" ? "font-extrabold" : "font-bold",
              )}
            >
              {th("icebreakersTitle")}
            </h2>
            <p className="mt-2 text-fg-muted">
              <Link href={`/events/${m.slug}`} className="font-semibold text-fg underline-offset-4 hover:underline">
                <BidiText text={title} />
              </Link>{" "}
              · <bdi className="font-mono">{formatShortDate(m.starts_at, locale)}</bdi>
            </p>
          </div>
          <PairMotif me={{ name: me.name, src: me.photoSrc }} partners={partners.map((p) => ({ name: p.full_name, src: photo(p.photo_url) }))} />
        </div>

        <div className="grid gap-3">
          <p className="text-sm text-fg-subtle">{trio ? t("yourPartners") : t("yourPartner")}</p>
          <ul className="grid gap-3">
            {partners.map((p) => {
              const bio = loc(p, "bio", locale);
              const linkedin = p.links?.linkedin;
              return (
                <li key={p.id} className="flex items-start gap-4 rounded-md border border-border bg-bg-raised p-4">
                  <MemberAvatar name={p.full_name} src={photo(p.photo_url)} size={56} />
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <div>
                      <Link href={`/members/${p.id}`} className="text-lg font-bold text-fg underline-offset-4 hover:underline">
                        {p.full_name}
                      </Link>
                      <ProfileSubline parts={[p.year ? tp("yearN", { n: p.year }) : null, p.faculty, p.program]} className="text-sm text-fg-subtle" />
                    </div>
                    {bio && <p className="max-w-[60ch] text-fg-muted">{bio}</p>}
                    <CommonChips items={p.common} label={t("inCommonYou")} />
                    {linkedin && /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(linkedin) && (
                      <a href={linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-brand-purple-soft underline-offset-4 hover:underline">
                        <LinkedInIcon className="size-4" />
                        LinkedIn
                        <span className="sr-only"> ({t("opensInNewTab")})</span>
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="flex items-start gap-2.5 rounded-md border border-dashed border-border-accent px-3.5 py-3 text-fg">
          <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-purple-soft" />
          <span>
            {firstCommon
              ? t.rich("tipCommon", { item: firstCommon, b: (c) => <b className="font-semibold">{c}</b> })
              : t("tipQuestion", { q: questions[hash % questions.length] })}
          </span>
        </p>

        <ConfirmMeet roundId={m.round_id} locale={locale} confirmedAt={m.confirmed_at} timeLabel={m.confirmed_at ? stamp.format(new Date(m.confirmed_at)) : null} labels={labels} />

        {rest.length > 0 && (
          <details className="group grid border-t border-border pt-4">
            <summary className="btn btn-ghost h-11 w-full cursor-pointer list-none justify-center px-3.5 text-sm text-brand-purple-soft [&::-webkit-details-marker]:hidden">
              {t("earlier", { n: rest.length })}
            </summary>
            <ul className="mt-3 grid gap-2">
              {rest.map((r) => (
                <li key={r.round_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex -space-x-2 rtl:space-x-reverse">
                      {r.partners.map((p) => (
                        <MemberAvatar key={p.id} name={p.full_name} src={photo(p.photo_url)} size={32} />
                      ))}
                    </span>
                    <span className="grid min-w-0 text-sm">
                      <b className="font-semibold text-fg">{r.partners.map((p) => p.full_name).join(t("and"))}</b>
                      <span className="text-fg-subtle">
                        <BidiText text={loc(r, "title", locale) ?? r.slug} /> · <bdi className="font-mono">{formatShortDate(r.starts_at, locale)}</bdi>
                      </span>
                    </span>
                  </span>
                  <ConfirmMeet roundId={r.round_id} locale={locale} confirmedAt={r.confirmed_at} timeLabel={null} labels={labels} compact />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

type Seat = { name: string; src: string | null };

/** Two seats joined by pixel squares: a pairing. Empty seats (?) until there's a match. Decorative. */
function PairMotif({ me, partners = [] }: { me?: Seat; partners?: Seat[] }) {
  const seat =
    "grid size-16 place-items-center rounded-full border-2 border-dashed border-brand-purple-soft bg-bg-raised font-pixel text-[1.375rem] leading-none text-brand-purple-soft md:size-[4.75rem]";
  const filled = (s: Seat | undefined, key: string) =>
    s ? (
      <MemberAvatar key={key} name={s.name} src={s.src} size={64} className="md:size-[4.75rem]!" />
    ) : (
      <span key={key} className={seat}>
        ?
      </span>
    );
  return (
    <div aria-hidden className="flex items-center gap-2.5 justify-self-start md:justify-self-end">
      {filled(me, "me")}
      <span className="flex gap-[5px]">
        <i className="size-[7px] bg-brand-purple" />
        <i className="size-[7px] bg-brand-purple-deeper" />
        <i className="size-[7px] bg-logo-block" />
        <i className="size-[7px] bg-brand-purple-deeper" />
      </span>
      {partners.length ? (
        <span className="flex -space-x-4 rtl:space-x-reverse">{partners.map((p, i) => filled(p, `p${i}`))}</span>
      ) : (
        filled(undefined, "empty")
      )}
    </div>
  );
}
