// Applies supabase/migrations/*.sql + supabase/seed.sql to an in-memory Postgres
// (PGlite, no Docker needed), then runs RLS checks as the `anon` role.
//
//   pnpm db:check            -> verify SQL + RLS
//   pnpm db:check --fixtures -> also write src/lib/data/fixtures.json (what anon sees)
//
// This is a stand-in until the real Supabase projects exist. The stubs below mimic
// only what our SQL needs from Supabase (auth.users, auth.uid(), auth.jwt(),
// anon/authenticated, the `extensions` schema). Milestone 2 role checks live in
// scripts/rls-m2.mjs.
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runM2Checks } from "./rls-m2.mjs";
import { runProfileChecks } from "./rls-m2-profiles.mjs";
import { runAttendanceChecks } from "./rls-m2-attendance.mjs";
import { runContentChecks } from "./rls-m3-content.mjs";
import { runLaunchChecks } from "./rls-launch.mjs";
import { runPairChecks } from "./rls-pair.mjs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const migrationsDir = join(root, "supabase", "migrations");
const writeFixtures = process.argv.includes("--fixtures");

const db = new PGlite({ extensions: { citext } });
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

// --- Supabase stubs ---------------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;
  create schema auth;
  create schema extensions;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz
  );
  -- Same as Supabase: claims come from the request.jwt.claims GUC that PostgREST sets.
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  -- No USAGE for supabase_auth_admin here: the members-launch migration must grant it (QA M1).
  grant usage on schema auth to anon, authenticated;
  grant usage on schema extensions to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated;
  -- Supabase grants everything on public tables AND functions to the API roles by
  -- default; mimic that so our migrations' revokes are actually tested.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  -- Supabase Storage, only the columns our policies touch. RLS is on, as in Supabase.
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner_id text,
    created_at timestamptz default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  alter table storage.buckets enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
`);

// --- Migrations + seed --------------------------------------------------------
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  console.log(`applied  ${file}`);
}
await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
console.log("applied  seed.sql");
await db.exec(readFileSync(join(root, "supabase", "seed-m3-content.sql"), "utf8"));
console.log("applied  seed-m3-content.sql");

// Snapshot of the seeded speaker links (LinkedIn, photo). Validation tests below must never change real rows;
// this is compared again right before the fixtures are written.
const seededSpeakers = JSON.stringify(
  (await db.query("select slug, linkedin_url, photo_url from public.speakers where slug <> 'secret-speaker' order by slug")).rows,
);
const seededTeam = JSON.stringify(
  (await db.query("select slug, linkedin_url, photo_url from public.club_team order by slug")).rows,
);

// A draft event + a speaker only on that draft, to prove neither leaks.
await db.exec(`
  insert into public.speakers (slug, name_he, name_en) values ('secret-speaker', 'סוד', 'Secret');
  insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at, status)
    select 'draft-event', id, 'טיוטה', 'Draft', now(), now() + interval '2 hours', 'draft'
    from public.cohorts where slug = '02';
  insert into public.event_speakers (event_id, speaker_id)
    select e.id, s.id from public.events e, public.speakers s
    where e.slug = 'draft-event' and s.slug = 'secret-speaker';
  insert into public.club_team (slug, name_he, name_en) values ('hidden-member', 'נסתר', 'Hidden');
`);

// --- Checks as anon -----------------------------------------------------------
const asAnon = async (sql) => {
  await db.exec("set role anon");
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
};

const events = await asAnon("select slug, status from public.events order by starts_at");
check(events.rows.length === 9, `anon sees 9 published events (got ${events.rows.length})`);
check(!events.rows.some((r) => r.slug === "draft-event"), "anon cannot see draft events");

const speakers = await asAnon("select slug from public.speakers");
check(speakers.rows.length === 7, `anon sees 7 speakers (got ${speakers.rows.length})`);
check(!speakers.rows.some((r) => r.slug === "secret-speaker"), "anon cannot see speakers only on drafts");

const lineups = await asAnon("select count(*)::int as n from public.event_speakers");
check(lineups.rows[0].n === 9, `anon sees 9 line-up rows (got ${lineups.rows[0].n})`);

// speakers.linkedin_url: public, readable by anon; only https://www.linkedin.com/in/<handle>.
const linkedin = await asAnon("select slug, linkedin_url from public.speakers where linkedin_url is not null order by slug");
check(
  JSON.stringify(linkedin.rows.map((r) => [r.slug, r.linkedin_url])) ===
    JSON.stringify([
      ["gavriel-goidel", "https://www.linkedin.com/in/goidelg/"],
      ["or-maccabi", "https://www.linkedin.com/in/ormaccabi/"],
      ["ori-goshen", "https://www.linkedin.com/in/ori-goshen/"],
      ["oz-altagar", "https://www.linkedin.com/in/oz-altagar-0a50861b3/"],
      ["roee-margalit", "https://www.linkedin.com/in/roee-margalit/"],
      ["shay-yahal", "https://www.linkedin.com/in/shay-yahal/"],
      ["tomer-diari", "https://www.linkedin.com/in/diari"],
    ]),
  `anon reads speakers.linkedin_url (all seven confirmed by the club; got ${JSON.stringify(linkedin.rows)})`,
);
for (const bad of [
  "http://www.linkedin.com/in/diari",
  "https://linkedin.com/in/diari",
  "https://www.linkedin.com/company/aleph",
  "https://www.linkedin.com/in/diari?trk=x",
  "https://www.linkedin.com/in/diari#x",
  "https://www.linkedin.com.evil.example/in/diari",
  "javascript:alert(1)//https://www.linkedin.com/in/x",
]) {
  let rejected = false;
  try {
    await db.query("update public.speakers set linkedin_url = $1 where slug = 'secret-speaker'", [bad]);
  } catch {
    rejected = true;
  }
  check(rejected, `linkedin_url rejects ${bad}`);
}
for (const good of ["https://www.linkedin.com/in/some-one_1/", "https://www.linkedin.com/in/%D7%A9%D7%99"]) {
  let ok = true;
  try {
    await db.query("update public.speakers set linkedin_url = $1 where slug = 'secret-speaker'", [good]);
  } catch {
    ok = false;
  }
  check(ok, `linkedin_url accepts ${good}`);
}
await db.exec("update public.speakers set linkedin_url = null where slug = 'secret-speaker'");

// club_team: anon reads published members only, in order, with their public LinkedIn.
const team = await asAnon("select slug, linkedin_url from public.club_team order by sort");
check(
  JSON.stringify(team.rows.map((r) => [r.slug, r.linkedin_url])) ===
    JSON.stringify([
      ["aviv-valyevich", "https://www.linkedin.com/in/aviv-valyevich/"],
      ["tali-amram", "https://www.linkedin.com/in/tali-amram-aa1067294/"],
      ["ido-perry", "https://www.linkedin.com/in/idoperryprofile/"],
      ["eric-berezin", "https://www.linkedin.com/in/eric-berezin-648867338/"],
    ]),
  `anon sees the 4 published founders in order with LinkedIn, not the unpublished one (got ${JSON.stringify(team.rows)})`,
);
for (const [col, value, ok] of [
  ["photo_url", "/team/ido-perry.webp", true],
  ["photo_url", "/speakers/x.webp", false],
  ["photo_url", "javascript:alert(1)", false],
  ["linkedin_url", "https://www.linkedin.com/in/ido-perry/", true],
  ["linkedin_url", "https://www.linkedin.com/in/x?trk=1", false],
]) {
  let accepted = true;
  try {
    await db.query(`update public.club_team set ${col} = $1 where slug = 'hidden-member'`, [value]);
  } catch {
    accepted = false;
  }
  check(accepted === ok, `club_team.${col} ${ok ? "accepts" : "rejects"} ${value}`);
}
await db.exec("update public.club_team set photo_url = null, linkedin_url = null where slug = 'hidden-member'");

// speakers.photo_url: https:// or one of our own /speakers/<slug>.webp files, nothing else.
for (const [url, ok] of [
  ["/speakers/or-maccabi.webp", true],
  ["https://abc.supabase.co/storage/v1/object/public/x.webp", true],
  ["/speakers/../secret.webp", false],
  ["//evil.example/x.webp", false],
  ["javascript:alert(1)", false],
  ["http://example.com/x.webp", false],
]) {
  let accepted = true;
  try {
    await db.query("update public.speakers set photo_url = $1 where slug = 'secret-speaker'", [url]);
  } catch {
    accepted = false;
  }
  check(accepted === ok, `photo_url ${ok ? "accepts" : "rejects"} ${url}`);
}
await db.exec("update public.speakers set photo_url = null where slug = 'secret-speaker'");

for (const [label, sql] of [
  ["insert event", "insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at) select 'x', id, 'x', 'x', now(), now() + interval '1 hour' from public.cohorts"],
  ["update event", "update public.events set title_en = 'hacked'"],
  ["delete venue", "delete from public.venues"],
  ["insert speaker", "insert into public.speakers (slug, name_he, name_en) values ('x', 'x', 'x')"],
  ["set a speaker's LinkedIn", "update public.speakers set linkedin_url = 'https://www.linkedin.com/in/attacker'"],
  ["insert a team member", "insert into public.club_team (slug, name_he, name_en, is_published) values ('x', 'x', 'x', true)"],
  ["publish a team member", "update public.club_team set is_published = true"],
  ["edit a team member", "update public.club_team set name_en = 'hacked'"],
  ["delete the team", "delete from public.club_team"],
]) {
  let blocked = false;
  try {
    await asAnon(sql);
  } catch {
    blocked = true;
  }
  check(blocked, `anon cannot ${label}`);
}

const times = await db.query(`
  select to_char(starts_at at time zone 'Asia/Jerusalem', 'Dy HH24:MI') as s,
         to_char(ends_at   at time zone 'Asia/Jerusalem', 'HH24:MI') as e,
         slug
  from public.events where status = 'published' order by starts_at`);
check(
  times.rows.every((r) => r.s.endsWith("18:00") && r.e === "20:00"),
  "every event is 18:00–20:00 Asia/Jerusalem",
);
check(
  times.rows.every((r) => r.s.startsWith("Wed") || r.slug === "joint-event-ori-goshen"),
  "every event is a Wednesday except the Sunday joint event",
);

// The validation tests above must leave every real speaker exactly as seeded.
const afterTests = JSON.stringify(
  (await db.query("select slug, linkedin_url, photo_url from public.speakers where slug <> 'secret-speaker' order by slug")).rows,
);
check(afterTests === seededSpeakers, "every speaker's linkedin_url and photo_url still equal the seed");
const teamAfterTests = JSON.stringify(
  (await db.query("select slug, linkedin_url, photo_url from public.club_team where slug <> 'hidden-member' order by slug")).rows,
);
check(teamAfterTests === seededTeam, "every founder's linkedin_url and photo_url still equal the seed");

// --- Fixtures (exactly what the app's anon query returns) ----------------------
if (writeFixtures && failures) {
  console.log("not writing fixtures: fix the failed checks first");
} else if (writeFixtures) {
  const res = await asAnon(`
    select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) as data from (
      select e.id, e.slug, e.kind, e.series, e.series_no, e.title_he, e.title_en, e.blurb_he, e.blurb_en,
             e.starts_at, e.ends_at, e.venue_note_he, e.venue_note_en, e.luma_url, e.is_tentative, e.updated_at,
             case when v.id is null then null else
               (select row_to_json(x) from (select v.id, v.name_he, v.name_en, v.address_he, v.address_en, v.maps_url) x)
             end as venue,
             coalesce((
               select json_agg(json_build_object('sort', es.sort, 'speaker', row_to_json(sp)) order by es.sort)
               from public.event_speakers es
               join lateral (select s.id, s.slug, s.name_he, s.name_en, s.company_he, s.company_en,
                                    s.role_he, s.role_en, s.photo_url, s.linkedin_url
                             from public.speakers s where s.id = es.speaker_id) sp on true
               where es.event_id = e.id
             ), '[]'::json) as event_speakers
      from public.events e
      left join public.venues v on v.id = e.venue_id
      where e.slug <> 'draft-event'
    ) t`);
  const cohort = await asAnon("select id, slug, name_he, name_en, tagline_he, tagline_en, starts_on::text, ends_on::text from public.cohorts where slug = '02'");
  const team = await asAnon(
    "select id, slug, name_he, name_en, role_en, company_en, photo_url, linkedin_url, sort from public.club_team order by sort",
  );
  const out = join(root, "src", "lib", "data", "fixtures.json");
  writeFileSync(out, JSON.stringify({ cohort: cohort.rows[0], events: res.rows[0].data, team: team.rows }, null, 2) + "\n");
  console.log(`wrote    ${out}`);

  // Public, published lecture/workshop sections, keyed by event slug (no ids, so the file is stable).
  const content = await asAnon(`
    select coalesce(json_object_agg(slug, sections), '{}'::json) as data from (
      select e.slug, json_object_agg(c.section, json_build_object('body_he', c.body_he, 'body_en', c.body_en)) as sections
      from public.event_content c join public.events e on e.id = c.event_id
      group by e.slug
    ) t`);
  const contentOut = join(root, "src", "lib", "data", "content-fixtures.json");
  writeFileSync(contentOut, JSON.stringify(content.rows[0].data, null, 2) + "\n");
  console.log(`wrote    ${contentOut}`);
}

// --- Milestone 2: roles, allowlist, speaker contact data ------------------------
// Runs after the fixture export: it writes test rows (members, contacts, an admin edit).
await runM2Checks(db, check);
await runProfileChecks(db, check);
await runAttendanceChecks(db, check);
await runContentChecks(db, check);
await runLaunchChecks(db, check);
await runPairChecks(db, check);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
// QA's independent members-launch suite (its own PGlite instance), so db:check fails when it does.
const { spawnSync } = await import("node:child_process");
const qa = spawnSync(process.execPath, [join(root, "tests", "db", "launch-rls.qa.mjs")], { stdio: "inherit" });
process.exit(failures || qa.status !== 0 ? 1 : 0);
