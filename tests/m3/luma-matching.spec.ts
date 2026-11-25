import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { suggestMember } from "../../src/lib/attendance/match";

// Luma emails matched to the right member (25.11). Members who register on Luma with another
// address (a private Gmail, an Apple relay, a typo) were counted as guests. The matching key, the
// linking table and who may use it are checked against the database in db:check (19d); here: the
// browser-side helper, and that the pieces are wired the way the migration promises.
// Fictional people only.

const ROOT = resolve(__dirname, "../..");
const src = (p: string) => readFileSync(resolve(ROOT, p), "utf8").replace(/^\s*\/\/.*$/gm, "");

test.describe("matching Luma emails to members", () => {
  test.skip(({ isMobile }) => isMobile, "pure check: desktop project only");

  const MEMBERS = [
    { id: "m1", full_name: "Tal Example" },
    { id: "m2", full_name: "נועה לוי" },
    { id: "m3", full_name: "Gal Shani" },
    { id: "m4", full_name: "Gal Shani" },
  ];

  test("the picker suggests the member with the Luma name (any order or case), only when it's one", () => {
    expect(suggestMember("Tal Example", MEMBERS)).toBe("m1");
    expect(suggestMember("example  TAL", MEMBERS)).toBe("m1");
    expect(suggestMember("נועה לוי", MEMBERS)).toBe("m2");
    expect(suggestMember("Gal Shani", MEMBERS)).toBe(""); // two members with that name: the admin picks
    expect(suggestMember("Someone Else", MEMBERS)).toBe("");
    expect(suggestMember(undefined, MEMBERS)).toBe("");
  });

  test("linking writes the attendance-only table, never the sign-in list, and is admins only", () => {
    const action = src("src/app/[locale]/admin/events/attendance-actions.ts");
    const link = action.slice(action.indexOf("export async function linkLumaEmail"));
    expect(link).toMatch(/await adminClient\(\)/);
    expect(link).toMatch(/\.from\("member_luma_emails"\)\.insert\(/);
    expect(link).not.toMatch(/\.from\("member_emails"\)\.(insert|upsert|update)/);
    // The session updates through the same import, unchanged, and only in the same phase.
    expect(link).toMatch(/uploadPhase\(.*\) !== input\.phase/);
    expect(link).toMatch(/rpc\("admin_import_attendance"/);
    expect(action.slice(action.indexOf("export async function membersForLinking"), action.indexOf("const EMAIL"))).toMatch(/select\("id, full_name"\)/);
  });

  test("the migration: no sign-in power, admins only, import statuses and pAIr unchanged", () => {
    const sql = src("supabase/migrations/20261126000000_attendance_email_matching.sql").replace(/^\s*--.*$/gm, "");
    expect(sql).toMatch(/create table public\.member_luma_emails/);
    expect(sql).toMatch(/revoke all on public\.member_luma_emails from public, anon, authenticated/);
    expect(sql).toMatch(/for all to authenticated\s+using \(\(select public\.is_admin\(\)\)\) with check \(\(select public\.is_admin\(\)\)\)/);
    expect(sql).not.toMatch(/grant [^;]* to anon/);
    // Not touched: the sign-in list and its functions, the statuses type, anything pAIr.
    expect(sql).not.toMatch(/insert into public\.member_emails|claim_membership|email_on_club_list|is_member\(\)|attendance_status as|pair_/i);
    // The status rule is the one from 20261117000000, word for word.
    const rule = /case when bool_or\(r\.checked_in\) then 'checked_in'\s+when v_ends < now\(\) then 'no_show'\s+else 'registered' end::public\.attendance_status/;
    expect(sql).toMatch(rule);
    expect(src("supabase/migrations/20261117000000_m2_attendance.sql")).toMatch(rule);
    // Non-members are still counted, never stored: no insert of unmatched emails anywhere.
    expect(sql).not.toMatch(/insert into public\.\w+[^;]*v_unmatched/);
  });

  test("the uploads show the unmatched rows, kept in the page only", () => {
    const ui = src("src/components/admin/attendance/attendance-import.tsx");
    expect(ui).toMatch(/<UnmatchedList/);
    expect(ui).toMatch(/setHeld\(\{ rows: parsed\.rows, labels: parsed\.labels \?\? \{\} \}\)/);
    const list = src("src/components/admin/attendance/unmatched-list.tsx");
    expect(list).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(list).toMatch(/linkLumaEmail\(\{ eventId, email, memberId, rows, commit: committed, phase \}\)/);
    const he = JSON.parse(readFileSync(resolve(ROOT, "messages/he.json"), "utf8")).attendance;
    const en = JSON.parse(readFileSync(resolve(ROOT, "messages/en.json"), "utf8")).attendance;
    for (const k of ["unmatchedTitle", "unmatchedBody", "unmatchedPick", "unmatchedChoose", "unmatchedLink", "unmatchedNotMember", "unmatchedNoName", "unmatchedLinked", "unmatchedLinkedLater", "unmatchedTaken", "unmatchedFailed", "unmatchedAllDone"]) {
      expect(he[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
  });

  // A member adds "the email I use on Luma" in the personal area: match only, never sign-in,
  // and never another member's address. The refusals themselves are checked in db:check (19e).
  test("self-added Luma emails: own rows only, through the three functions, never sign-in", () => {
    const sql = src("supabase/migrations/20261126000000_attendance_email_matching.sql").replace(/^\s*--.*$/gm, "");
    const fns = sql.slice(sql.indexOf("create or replace function public.my_luma_emails"));
    expect(fns).toMatch(/v_member uuid := public\.current_member_id\(\)/);
    expect(fns).toMatch(/raise exception 'taken'/);
    expect(fns).toMatch(/e\.member_id <> v_member/);
    expect(fns).toMatch(/l\.member_id <> v_member/);
    expect(fns).toMatch(/where l\.member_id = v_member and/); // remove: only my rows
    expect(fns).not.toMatch(/member_emails \(|update public\.member_emails/); // never writes the sign-in list
    expect(fns).toMatch(/revoke all on function public\.my_luma_emails\(\), public\.add_my_luma_email\(text\), public\.remove_my_luma_email\(text\)\s+from public, anon, authenticated/);

    const actions = src("src/app/[locale]/profile/actions.ts");
    const add = actions.slice(actions.indexOf("export async function addLumaEmail"));
    expect(add).toMatch(/await memberClient\(\)/);
    expect(add).toMatch(/rpc\("add_my_luma_email"/);
    expect(add).not.toMatch(/\.from\("member_(luma_)?emails"\)/);
    expect(src("src/components/members/profile-editor.tsx")).toMatch(/<LumaEmails emails=\{lumaEmails\} \/>/);
    expect(src("src/app/[locale]/me/page.tsx")).toMatch(/getMyLumaEmails\(supabase\)/);
    const ui = src("src/components/members/luma-emails.tsx");
    expect(ui).not.toMatch(/"use client"/);

    const he = JSON.parse(readFileSync(resolve(ROOT, "messages/he.json"), "utf8")).profile;
    const en = JSON.parse(readFileSync(resolve(ROOT, "messages/en.json"), "utf8")).profile;
    for (const k of ["lumaTitle", "lumaBody", "lumaAdd", "lumaAddButton", "lumaHint", "lumaRemove", "lumaMax", "lumaAdded", "lumaExists", "lumaOwn", "lumaRemoved", "lumaErrorInvalid", "lumaErrorTaken", "lumaErrorLimit"]) {
      expect(he[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
  });
});
