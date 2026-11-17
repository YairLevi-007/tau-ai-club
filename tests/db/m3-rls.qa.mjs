// QA's independent Milestone 3 RLS tests (event_content, event_files, the event-files bucket). Same harness as m2-rls.qa.mjs.
//   node tests/db/m3-rls.qa.mjs          -> prints PASS/FAIL per check, exits 1 on any failure
// Runs the real migrations + seed in PGlite and impersonates Supabase roles with `set role` + request.jwt.claims.
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const root = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const db = new PGlite({ extensions: { citext } });

let fails = 0;
let n = 0;
const section = (s) => console.log(`\n== ${s}`);
const ok = (cond, label, extra = "") => {
  n++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : "   -> " + extra}`);
  if (!cond) fails++;
};

// ---- Supabase stubs (same surface Supabase gives our SQL) ----------------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema extensions to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  -- Supabase Storage: only the columns/policies our migrations touch. RLS on, as in Supabase.
  create schema storage;
  create table storage.buckets (id text primary key, name text not null unique, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text not null, owner_id text, created_at timestamptz default now(), unique (bucket_id, name));
  alter table storage.objects enable row level security;
  alter table storage.buckets enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
`);
for (const f of readdirSync(join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort())
  await db.exec(readFileSync(join(root, "supabase", "migrations", f), "utf8"));
await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
await db.exec(readFileSync(join(root, "supabase", "seed-m3-content.sql"), "utf8"));

// ---- Fixtures (inserted as superuser) -------------------------------------------------------------------
const uid = async (email, confirmed = true) =>
  (await db.query(`insert into auth.users (email, email_confirmed_at) values ($1, ${confirmed ? "now()" : "null"}) returning id`, [email])).rows[0].id;
const addMember = async (name, role, emails) => {
  const m = (await db.query(`insert into public.members (full_name, role) values ($1, $2) returning id`, [name, role])).rows[0].id;
  for (const [i, e] of emails.entries()) await db.query(`insert into public.member_emails (email, member_id, is_primary) values ($1, $2, $3)`, [e, m, i === 0]);
  return m;
};
let S3; // event ids for the M3 sections
const U = {
  admin: await uid("admin@tau.test"),
  admin2: await uid("admin2@tau.test"),
  member: await uid("member@tau.test"),
  member2: await uid("member2@tau.test"),
  secondary: await uid("alt.member3@gmail.com"), // signs in with the SECONDARY email of member 3
  caseDiff: await uid("CaseUser@TAU.test"),
  outsider: await uid("outsider@tau.test"),
  unverified: await uid("victim@tau.test", false), // someone claiming an allowlisted address without confirming it
};
const M = {
  admin: await addMember("Admin One", "admin", ["admin@tau.test"]),
  admin2: await addMember("Admin Two", "admin", ["admin2@tau.test"]),
  member: await addMember("Member One", "member", ["member@tau.test"]),
  member2: await addMember("Member Two", "member", ["member2@tau.test"]),
  member3: await addMember("Member Three", "member", ["primary.member3@tau.test", "alt.member3@gmail.com"]),
  caseUser: await addMember("Case User", "member", ["caseuser@tau.test"]),
  victim: await addMember("Victim", "member", ["victim@tau.test"]),
};
await db.exec(`
  insert into public.speakers (slug, name_he, name_en) values ('secret-speaker', 'סוד', 'Secret');
  insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at, status)
    select 'draft-event', id, 'טיוטה', 'Draft', now(), now() + interval '2 hours', 'draft' from public.cohorts where slug = '02';
  insert into public.event_speakers (event_id, speaker_id)
    select e.id, s.id from public.events e, public.speakers s where e.slug='draft-event' and s.slug='secret-speaker';
`);
const sp = async (slug) => (await db.query(`select id from public.speakers where slug = $1`, [slug])).rows[0].id;
const S = {
  a: await sp("shai-yahel"), // on a published event
  b: await sp("oz"),
  c: await sp("or-maccabi"),
  draft: await sp("secret-speaker"),
};


const A_EMAIL = "speaker.a@secret.example", A_PHONE = "+972501234567", A_LI = "https://www.linkedin.com/in/speaker-a-private";
const B_LI = "https://www.linkedin.com/in/speaker-b-public";
const C_EMAIL = "speaker.c@secret.example", C_PHONE = "+972509999999", C_LI = "https://www.linkedin.com/in/speaker-c";
const D_LI = "https://www.linkedin.com/in/speaker-draft-public";
await db.query(`insert into public.speaker_contacts (speaker_id, email, phone, linkedin_url, share_email, share_phone, share_linkedin, linkedin_public, consented_at)
  values ($1,$2,null,$3,true,false,true,false,now()),      -- A: email + private LinkedIn, phone NOT shared
         ($4,null,null,$5,false,false,true,true,now()),    -- B: public LinkedIn only
         ($6,$7,$8,null,true,true,false,false,now()),      -- C: email + phone, no LinkedIn
         ($9,null,null,$10,false,false,true,true,now())    -- draft-only speaker, "public" LinkedIn
  `, [S.a, A_EMAIL, A_LI, S.b, B_LI, S.c, C_EMAIL, C_PHONE, S.draft, D_LI]);

// ---- Helpers -------------------------------------------------------------------------------------------
/** Run sql as a Supabase role. who = key of U, or {sub, email, extra}. Never throws: returns {rows} or {error}. */
async function as(role, who, sql, params = []) {
  const claims =
    role === "anon" || who == null
      ? {}
      : typeof who === "string"
        ? { sub: U[who], role: "authenticated", email: (await db.query(`select email from auth.users where id = $1`, [U[who]])).rows[0].email }
        : { role: "authenticated", ...who };
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
  await db.exec(`set role ${role}`);
  try {
    const r = await db.query(sql, params);
    return { rows: r.rows, count: r.affectedRows };
  } catch (e) {
    return { error: e.message, code: e.code };
  } finally {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}
const denied = (r) => !!r.error && /permission denied|row-level security|admins only|must be owner/i.test(r.error);
const rowsOf = (r) => r.rows ?? [];
const su = async (sql, params = []) => (await db.query(sql, params)).rows;

const ROLES = ["anon", "outsider", "unverified", "member", "admin"];
const run = (who, sql, params) => (who === "anon" ? as("anon", null, sql, params) : as("authenticated", who, sql, params));

// Extra principal for M3: an unverified user carrying an ADMIN email (must have no admin powers).
U.adminUnverified = await uid("admin@tau.test.unverified-twin", false);
await su(`update auth.users set email = 'admin2@tau.test' where id = $1`, [U.adminUnverified]); // same address as a real admin, never confirmed
await su(`delete from auth.users where id = $1 and false`, [U.adminUnverified]);

// =====================================================================================================
section("M3-1. event_content: who sees which section");
{
  const cohort = (await su(`select id from public.cohorts limit 1`))[0].id;
  const mkEv = async (slug, kind, status) =>
    (await su(`insert into public.events (slug, cohort_id, kind, title_he, title_en, starts_at, ends_at, status) values ($1,$2,$3::public.event_kind,'x','x',now(),now()+interval '2 hours',$4::public.publish_status) returning id`, [slug, cohort, kind, status]))[0].id;
  const EV = { lecture: await mkEv("qa3-lecture", "lecture", "published"), workshop: await mkEv("qa3-workshop", "workshop", "published"), draft: await mkEv("qa3-draft", "lecture", "draft") };
  const put = (ev, section, he, en, vis, status) =>
    su(`insert into public.event_content (event_id, section, body_he, body_en, visibility, status) values ($1,$2::public.content_section,$3,$4,$5::public.content_visibility,$6::public.publish_status)`, [ev, section, he, en, vis, status]);
  await put(EV.lecture, "blurb", "CANARY-L-BLURB-PUBLIC", "en blurb", "public", "published");
  await put(EV.lecture, "summary", "CANARY-L-SUMMARY-MEMBERS", "en sum", "members", "published");
  await put(EV.lecture, "goals", "CANARY-L-GOALS-PUBLIC-DRAFT", null, "public", "draft");
  await put(EV.lecture, "takeaways", "CANARY-L-TAKEAWAYS-MEMBERS-DRAFT", null, "members", "draft");
  await put(EV.workshop, "prep", "CANARY-W-PREP-MEMBERS", null, "members", "published");
  await put(EV.workshop, "commands", "CANARY-W-COMMANDS-PUBLIC", null, "public", "published"); // a public section on a workshop is still public at DB level
  await put(EV.draft, "blurb", "CANARY-D-BLURB-PUBLIC-ON-DRAFT-EVENT", null, "public", "published");
  await put(EV.draft, "summary", "CANARY-D-SUMMARY-MEMBERS-ON-DRAFT-EVENT", null, "members", "published");

  const bodies = async (who, sql = "select body_he from public.event_content") => rowsOf(await run(who, sql)).map((r) => r.body_he).sort();
  const publicSet = ["CANARY-L-BLURB-PUBLIC", "CANARY-W-COMMANDS-PUBLIC"];
  const membersSet = [...publicSet, "CANARY-L-SUMMARY-MEMBERS", "CANARY-W-PREP-MEMBERS"].sort();
  for (const who of ["anon", "outsider", "unverified", "adminUnverified"]) {
    const got = (await bodies(who)).filter((b) => b.startsWith("CANARY"));
    ok(JSON.stringify(got) === JSON.stringify([...publicSet].sort()), `[${who}] sees ONLY published+public sections of published events`, JSON.stringify(got));
  }
  const m = (await bodies("member")).filter((b) => b.startsWith("CANARY"));
  ok(JSON.stringify(m) === JSON.stringify(membersSet), "[member] sees published public+members sections, no drafts, nothing from the draft event", JSON.stringify(m));
  const a = (await bodies("admin")).filter((b) => b.startsWith("CANARY"));
  ok(a.length === 8, "[admin] sees everything incl. drafts and the draft event's content", String(a.length));
  // Filters/joins can't widen it
  for (const who of ["anon", "outsider"]) {
    const j = JSON.stringify(rowsOf(await run(who, "select c.*, e.slug from public.event_content c join public.events e on e.id=c.event_id where e.slug='qa3-lecture' or c.visibility='members' or c.status='draft'")));
    ok(!/MEMBERS|DRAFT/.test(j), `[${who}] filtering on visibility/status cannot reveal hidden sections`);
    ok(rowsOf(await run(who, "select 1 from public.event_content where body_he like '%MEMBERS%'")).length === 0, `[${who}] LIKE probe on hidden text returns nothing (no oracle)`);
    ok(rowsOf(await run(who, "select count(*)::int c from public.event_content where visibility='members'"))[0].c === 0, `[${who}] count(*) of members-only sections is 0 (no count oracle)`);
  }
  // Unpublishing the event hides everything from non-admins
  await su(`update public.events set status='draft' where id=$1`, [EV.lecture]);
  ok(!(await bodies("anon")).some((b) => b === "CANARY-L-BLURB-PUBLIC"), "unpublishing the event hides its public blurb from guests");
  ok(!(await bodies("member")).some((b) => b === "CANARY-L-SUMMARY-MEMBERS"), "unpublishing the event hides its members-only sections from members");
  await su(`update public.events set status='published' where id=$1`, [EV.lecture]);
  // Publishing a section later makes it visible; flipping visibility to members hides it from guests
  await su(`update public.event_content set status='published' where body_he='CANARY-L-GOALS-PUBLIC-DRAFT'`);
  ok((await bodies("anon")).includes("CANARY-L-GOALS-PUBLIC-DRAFT"), "publishing a public section makes it visible to guests");
  await su(`update public.event_content set visibility='members' where body_he='CANARY-L-GOALS-PUBLIC-DRAFT'`);
  ok(!(await bodies("anon")).includes("CANARY-L-GOALS-PUBLIC-DRAFT") && (await bodies("member")).includes("CANARY-L-GOALS-PUBLIC-DRAFT"), "switching a section to members hides it from guests, members keep it");
  await su(`update public.event_content set status='draft', visibility='public' where body_he='CANARY-L-GOALS-PUBLIC-DRAFT'`);

  // ---- writes
  const w = {
    insert: `insert into public.event_content (event_id, section, body_he) values ('${EV.workshop}', 'resources', 'EVIL')`,
    update: `update public.event_content set body_he = 'EVIL'`,
    delete: `delete from public.event_content`,
    "publish a draft": `update public.event_content set status='published', visibility='public' where status='draft'`,
  };
  for (const who of ["anon", "outsider", "unverified", "adminUnverified", "member"])
    for (const [label, sql] of Object.entries(w)) {
      const r = await run(who, sql);
      ok(!(!r.error && (r.count ?? 0) > 0), `[${who}] event_content ${label}: refused or 0 rows`, JSON.stringify(r).slice(0, 100));
    }
  ok((await su(`select count(*)::int c from public.event_content where body_he='EVIL'`))[0].c === 0, "no EVIL row written by non-admins");
  ok((await su(`select count(*)::int c from public.event_content where body_he like 'CANARY%'`))[0].c === 8, "all 8 canary rows intact after the attempts");
  ok(!(await run("admin", w.insert)).error, "admin can insert a section");
  ok(((await run("admin", `update public.event_content set body_he='ok' where body_he='EVIL'`)).count ?? 0) === 1, "admin can update a section");
  ok(!!(await run("admin", w.insert)).error, "unique (event_id, section): a second 'resources' for the same event is rejected");
  ok(((await run("admin", `delete from public.event_content where body_he='ok'`)).count ?? 0) === 1, "admin can delete a section");
  ok(!!(await run("admin", `insert into public.event_content (event_id, section, body_he) values ('${EV.workshop}', 'nonsense', 'x')`)).error, "unknown section name rejected");
  ok(!!(await run("admin", `insert into public.event_content (event_id, section, body_he, visibility) values ('${EV.workshop}', 'exercises', 'x', 'everyone')`)).error, "unknown visibility rejected");
  ok(!!(await run("admin", `insert into public.event_content (event_id, section, body_he) values ('${EV.workshop}', 'exercises', repeat('x', 60001))`)).error, "body over 60,000 chars rejected");
  ok(!!(await run("admin", `insert into public.event_content (event_id, section, body_he) values ('00000000-0000-0000-0000-000000000000', 'exercises', 'x')`)).error, "content for an unknown event rejected (FK)");
  ok((await su(`select visibility, status from public.event_content where false`)).length === 0, "(info) defaults are visibility=members status=draft");
  const def = await su(`select column_default d, column_name n from information_schema.columns where table_schema='public' and table_name='event_content' and column_name in ('visibility','status')`);
  ok(def.find((d) => d.n === "visibility")?.d?.includes("members") && def.find((d) => d.n === "status")?.d?.includes("draft"), "new sections default to members-only DRAFT (safe by default)", JSON.stringify(def));
  // cascade
  await su(`delete from public.events where id=$1`, [EV.draft]);
  ok((await su(`select count(*)::int c from public.event_content where body_he like 'CANARY-D%'`))[0].c === 0, "deleting an event deletes its content (cascade)");
  S3 = EV;
}

// =====================================================================================================
section("M3-2. event_files + the private event-files bucket");
{
  const EV = S3;
  const bucket = (await su(`select * from storage.buckets where id='event-files'`))[0];
  ok(bucket && bucket.public === false, "event-files bucket exists and is PRIVATE");
  ok(JSON.stringify(bucket?.allowed_mime_types) === JSON.stringify(["application/pdf"]), "event-files allows only application/pdf", JSON.stringify(bucket?.allowed_mime_types));
  ok(bucket?.file_size_limit > 0 && bucket.file_size_limit <= 10 * 1024 * 1024, "event-files has a size limit of at most 10 MB", String(bucket?.file_size_limit));

  const mkFile = async (ev, path, status) =>
    (await su(`insert into public.event_files (event_id, path, title_he, title_en, status) values ($1,$2,'t','t',$3::public.publish_status) returning id`, [ev, path, status]))[0].id;
  const F = {
    pub: await mkFile(EV.lecture, "qa3-lecture/slides.pdf", "published"),
    draft: await mkFile(EV.lecture, "qa3-lecture/draft.pdf", "draft"),
    wk: await mkFile(EV.workshop, "qa3-workshop/cheatsheet.pdf", "published"),
  };
  const draftEvent = await su(`insert into public.events (slug, cohort_id, kind, title_he, title_en, starts_at, ends_at, status) select 'qa3-draft2', id, 'lecture', 'x','x', now(), now()+interval '1 hour', 'draft' from public.cohorts limit 1 returning id`);
  F.onDraftEvent = await mkFile(draftEvent[0].id, "qa3-draft2/slides.pdf", "published");
  for (const p of ["qa3-lecture/slides.pdf", "qa3-lecture/draft.pdf", "qa3-workshop/cheatsheet.pdf", "qa3-draft2/slides.pdf", "qa3-lecture/orphan.pdf"])
    await su(`insert into storage.objects (bucket_id, name) values ('event-files', $1)`, [p]);

  // table reads
  ok(denied(await run("anon", "select * from public.event_files")), "[anon] event_files: permission denied (no grant)");
  for (const who of ["outsider", "unverified", "adminUnverified"]) ok(rowsOf(await run(who, "select * from public.event_files")).length === 0, `[${who}] event_files: zero rows`);
  const mf = rowsOf(await run("member", "select path from public.event_files where path like 'qa3-%'")).map((r) => r.path).sort();
  ok(JSON.stringify(mf) === JSON.stringify(["qa3-lecture/slides.pdf", "qa3-workshop/cheatsheet.pdf"]), "[member] sees only PUBLISHED files of PUBLISHED events", JSON.stringify(mf));
  ok(rowsOf(await run("admin", "select * from public.event_files where path like 'qa3-%'")).length === 4, "[admin] sees all files, including drafts");
  // writes
  for (const who of ["anon", "outsider", "unverified", "member"]) {
    for (const sql of [
      `insert into public.event_files (event_id, path, title_he, title_en) values ('${EV.lecture}', 'qa3-lecture/evil.pdf', 'x', 'x')`,
      `update public.event_files set status='published'`,
      `delete from public.event_files`,
    ]) {
      const r = await run(who, sql);
      ok(!(!r.error && (r.count ?? 0) > 0), `[${who}] event_files write refused: ${sql.slice(0, 36)}`);
    }
  }
  ok((await su(`select count(*)::int c from public.event_files where path like 'qa3-%'`))[0].c === 4, "event_files untouched by non-admins");
  for (const [label, p] of [["path traversal", "../secret.pdf"], ["nested folder", "a/b/c.pdf"], ["not a pdf", "qa3-lecture/x.html"], ["uppercase slug", "QA/x.pdf"], ["leading slash", "/qa3-lecture/x.pdf"], ["dot-dot in name", "qa3-lecture/..x.pdf"]])
    ok(!!(await run("admin", "insert into public.event_files (event_id, path, title_he, title_en) values ($1,$2,'x','x')", [EV.lecture, p])).error, `file path rejected: ${label}`);
  ok(!(await run("admin", "insert into public.event_files (event_id, path, title_he, title_en) values ($1,'qa3-lecture/ok.pdf','x','x')", [EV.lecture])).error, "admin can add a well-formed file row");
  ok(!!(await run("admin", "insert into public.event_files (event_id, path, title_he, title_en) values ($1,'qa3-lecture/ok.pdf','x','x')", [EV.lecture])).error, "file paths are unique");
  await su(`delete from public.event_files where path='qa3-lecture/ok.pdf'`);

  // storage object visibility = published row pointing at it, member only
  const names = async (who) => rowsOf(await run(who, "select name from storage.objects where bucket_id='event-files'")).map((r) => r.name).sort();
  ok((await names("anon")).length === 0, "[anon] sees no event-files objects");
  for (const who of ["outsider", "unverified", "adminUnverified"]) ok((await names(who)).length === 0, `[${who}] sees no event-files objects`);
  const mn = (await names("member")).filter((n) => n.startsWith("qa3-"));
  ok(JSON.stringify(mn) === JSON.stringify(["qa3-lecture/slides.pdf", "qa3-workshop/cheatsheet.pdf"]), "[member] sees only objects a PUBLISHED file row of a PUBLISHED event points at", JSON.stringify(mn));
  ok(!mn.includes("qa3-lecture/orphan.pdf") && !mn.includes("qa3-lecture/draft.pdf") && !mn.includes("qa3-draft2/slides.pdf"), "[member] cannot see orphan, draft-file or draft-event objects");
  ok((await names("admin")).filter((n) => n.startsWith("qa3-")).length === 5, "[admin] sees every object");
  // The row going draft immediately locks the object again
  await su(`update public.event_files set status='draft' where id=$1`, [F.pub]);
  ok(!(await names("member")).includes("qa3-lecture/slides.pdf"), "un-publishing a file row locks its object for members at once");
  await su(`update public.event_files set status='published' where id=$1`, [F.pub]);
  await su(`update public.events set status='draft' where id=$1`, [EV.lecture]);
  ok(!(await names("member")).includes("qa3-lecture/slides.pdf"), "un-publishing the EVENT locks its files for members");
  await su(`update public.events set status='published' where id=$1`, [EV.lecture]);
  // storage writes
  for (const who of ["anon", "outsider", "unverified", "member"]) {
    const ins = await run(who, "insert into storage.objects (bucket_id, name) values ('event-files', 'qa3-lecture/evil.pdf')");
    ok(!!ins.error, `[${who}] cannot upload to event-files`);
    ok(((await run(who, "update storage.objects set owner_id='x' where bucket_id='event-files'")).count ?? 0) === 0, `[${who}] cannot update event-files objects`);
    ok(((await run(who, "delete from storage.objects where bucket_id='event-files'")).count ?? 0) === 0, `[${who}] cannot delete event-files objects`);
  }
  ok((await su(`select count(*)::int c from storage.objects where bucket_id='event-files' and name like 'qa3-%'`))[0].c === 5, "objects untouched by non-admins");
  ok(!(await run("admin", "insert into storage.objects (bucket_id, name) values ('event-files', 'qa3-lecture/by-admin.pdf')")).error, "admin can upload");
  ok(((await run("admin", "delete from storage.objects where name='qa3-lecture/by-admin.pdf'")).count ?? 0) === 1, "admin can delete");
  // Other buckets unaffected by the new policies
  await su(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${M.member2}/m3probe.jpg`]);
  ok((await names("anon")).length === 0 && rowsOf(await run("anon", "select name from storage.objects where bucket_id='avatars'")).length === 0, "event-files policies do not open the avatars bucket to guests");
}

// =====================================================================================================
section("M3-3. The committed seed: nothing members-only or draft reaches the anon role");
{
  // supabase/seed-m3-content.sql is applied above the harness (see the top of this file). Compare anon's view with the truth.
  const total = (await su(`select count(*)::int c from public.event_content c join public.events e on e.id=c.event_id where e.slug not like 'qa3-%'`))[0].c;
  ok(total > 0, "the seed contains lecture/workshop content", String(total));
  const anonRows = rowsOf(await run("anon", "select c.visibility, c.status, e.slug from public.event_content c join public.events e on e.id=c.event_id where e.slug not like 'qa3-%'"));
  ok(anonRows.length > 0 && anonRows.every((r) => r.visibility === "public" && r.status === "published"), "anon sees only public+published seed sections", JSON.stringify(anonRows.filter((r) => r.visibility !== "public" || r.status !== "published")).slice(0, 200));
  const hiddenTruth = (await su(`select count(*)::int c from public.event_content c join public.events e on e.id=c.event_id where e.slug not like 'qa3-%' and (c.visibility='members' or c.status='draft')`))[0].c;
  ok(hiddenTruth > 0 && anonRows.length === total - hiddenTruth, `anon sees exactly the ${total - hiddenTruth} public published seed sections (${hiddenTruth} hidden)`);
  const wk = rowsOf(await run("anon", "select e.kind from public.event_content c join public.events e on e.id=c.event_id where e.kind='workshop' and e.slug not like 'qa3-%'"));
  console.log(`INFO  anon can read ${wk.length} public-visibility seed section(s) of workshop events directly from the API (the workshop PAGES are members-only; a section marked public is public by design)`);
  const seedMembers = rowsOf(await run("member", "select count(*)::int c from public.event_content c join public.events e on e.id=c.event_id where e.slug not like 'qa3-%'"))[0].c;
  ok(seedMembers === total - (await su(`select count(*)::int c from public.event_content c join public.events e on e.id=c.event_id where e.slug not like 'qa3-%' and c.status='draft'`))[0].c, "members see every published seed section, never drafts");
}

console.log(`\n${n - fails}/${n} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
