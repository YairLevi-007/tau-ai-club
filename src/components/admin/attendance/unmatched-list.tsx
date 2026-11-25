"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link2, LoaderCircle, UserRoundX } from "lucide-react";
import type { AttendanceRow } from "@/lib/attendance/luma-csv";
import type { UploadPhase } from "@/lib/attendance/phases";
import { linkLumaEmail, membersForLinking, type AttendanceResult, type LinkableMember } from "@/app/[locale]/admin/events/attendance-actions";
import { isStalePage } from "@/components/admin/stale-page";
import { hintClass, inputClass, smallBtn } from "@/components/admin/styles";
import { suggestMember } from "@/lib/attendance/match";
import { cn } from "@/lib/utils";

/**
 * The upload's rows that matched no member (25.11): only club members come to sessions, so each is
 * most likely a member who registered on Luma with another email. The admin picks who it is (the
 * email is then linked to them, for matching only) or marks it "not a member" (for this upload).
 * Lives in the browser only: the emails came from the admin's own file, the names never left it.
 */
export function UnmatchedList({
  eventId,
  phase,
  emails,
  labels,
  rows,
  committed,
  onLinked,
  onStale,
}: {
  eventId: string;
  phase?: UploadPhase;
  emails: string[];
  labels: Record<string, string>;
  rows: AttendanceRow[];
  committed: boolean;
  onLinked: (email: string, result: AttendanceResult | null) => void;
  onStale: () => void;
}) {
  const t = useTranslations("attendance");
  const [members, setMembers] = useState<LinkableMember[] | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    membersForLinking()
      .then((m) => live && setMembers(m))
      .catch((e) => (isStalePage(e) ? onStale() : live && setMembers([])));
    return () => {
      live = false;
    };
  }, [onStale]);

  const open = useMemo(() => emails.filter((e) => !dismissed.includes(e)), [emails, dismissed]);
  const choice = (email: string) => picked[email] ?? (members ? suggestMember(labels[email], members) : "");

  async function link(email: string) {
    const memberId = choice(email);
    const member = members?.find((m) => m.id === memberId);
    if (!member) return;
    setBusy(email);
    setNote(null);
    try {
      const res = await linkLumaEmail({ eventId, email, memberId, rows, commit: committed, phase });
      if (!res.ok) return setNote({ ok: false, text: t(res.error === "taken" ? "unmatchedTaken" : "unmatchedFailed") });
      setNote({ ok: true, text: t(res.reimported ? "unmatchedLinked" : "unmatchedLinkedLater", { name: member.full_name }) });
      onLinked(email, res.result);
    } catch (e) {
      if (isStalePage(e)) return onStale();
      setNote({ ok: false, text: t("unmatchedFailed") });
    } finally {
      setBusy(null);
    }
  }

  if (!open.length && !note) return null;

  return (
    <section className="grid gap-3 rounded-lg border border-border-accent/70 bg-bg-deep/35 p-4" aria-labelledby={`unmatched-${eventId}`} data-testid="unmatched">
      <div className="grid gap-1">
        <h3 id={`unmatched-${eventId}`} className="text-sm font-semibold text-fg">
          {open.length ? t("unmatchedTitle", { n: open.length }) : t("unmatchedAllDone")}
        </h3>
        {open.length > 0 && <p className={cn(hintClass, "max-w-[70ch]")}>{t("unmatchedBody")}</p>}
      </div>
      {note && (
        <p role={note.ok ? "status" : "alert"} className={cn("text-sm", note.ok ? "text-fg-muted" : "text-destructive")} data-testid="unmatched-note">
          {note.text}
        </p>
      )}
      {open.length > 0 && (
        <ul className="grid gap-2.5">
          {open.map((email) => {
            const id = `pick-${eventId}-${email}`;
            return (
              <li key={email} className="grid gap-2 rounded-md border border-border bg-bg-deep/40 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] sm:items-end" data-testid="unmatched-row">
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate font-medium text-fg">{labels[email] ? <bdi>{labels[email]}</bdi> : t("unmatchedNoName")}</span>
                  <bdi dir="ltr" className="truncate text-start font-mono text-xs text-fg-muted">
                    {email}
                  </bdi>
                </div>
                <label htmlFor={id} className="grid gap-1 text-xs text-fg-subtle">
                  {t("unmatchedPick")}
                  <select
                    id={id}
                    className={cn(inputClass, "h-10")}
                    value={choice(email)}
                    disabled={!members || busy !== null}
                    onChange={(e) => setPicked((p) => ({ ...p, [email]: e.target.value }))}
                    data-testid="unmatched-member"
                  >
                    <option value="">{members ? t("unmatchedChoose") : t("reading")}</option>
                    {members?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary h-10 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-45" disabled={!choice(email) || busy !== null} onClick={() => link(email)} data-testid="unmatched-link">
                    {busy === email ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Link2 aria-hidden />}
                    {t("unmatchedLink")}
                  </button>
                  <button type="button" className={smallBtn} disabled={busy !== null} onClick={() => setDismissed((d) => [...d, email])} data-testid="unmatched-dismiss">
                    <UserRoundX aria-hidden />
                    {t("unmatchedNotMember")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
