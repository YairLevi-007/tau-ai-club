// Applies supabase/migrations/*.sql + supabase/seed.sql to an in-memory Postgres
// (PGlite, no Docker needed), then runs RLS checks as the `anon` role.
//
//   pnpm db:check            -> verify SQL + RLS
//   pnpm db:check --fixtures -> also write src/lib/data/fixtures.json (what anon sees)
//
// This is a stand-in until the real Supabase projects exist. The stubs below mimic
// only what our SQL needs from Supabase (auth.users, auth.uid(), anon/authenticated).
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const migrationsDir = join(root, "supabase", "migrations");
const writeFixtures = process.argv.includes("--fixtures");

const db = new PGlite();
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
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated;
  -- Supabase grants everything on public tables to the API roles by default;
  -- mimic that so our migration's revokes are actually tested.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);

// --- Migrations + seed --------------------------------------------------------
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  console.log(`applied  ${file}`);
}
await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
console.log("applied  seed.sql");

// A draft event + a speaker only on that draft, to prove neither leaks.
await db.exec(`
  insert into public.speakers (slug, name_he, name_en) values ('secret-speaker', 'סוד', 'Secret');
  insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at, status)
    select 'draft-event', id, 'טיוטה', 'Draft', now(), now() + interval '2 hours', 'draft'
    from public.cohorts where slug = '02';
  insert into public.event_speakers (event_id, speaker_id)
    select e.id, s.id from public.events e, public.speakers s
    where e.slug = 'draft-event' and s.slug = 'secret-speaker';
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
const linkedin = await asAnon("select slug, linkedin_url from public.speakers where linkedin_url is not null");
check(
  linkedin.rows.length === 1 && linkedin.rows[0].linkedin_url === "https://www.linkedin.com/in/diari",
  `anon reads speakers.linkedin_url (only Tomer's is set; got ${JSON.stringify(linkedin.rows)})`,
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
    await db.query("update public.speakers set linkedin_url = $1 where slug = 'or-maccabi'", [bad]);
  } catch {
    rejected = true;
  }
  check(rejected, `linkedin_url rejects ${bad}`);
}
for (const good of ["https://www.linkedin.com/in/some-one_1/", "https://www.linkedin.com/in/%D7%A9%D7%99"]) {
  let ok = true;
  try {
    await db.query("update public.speakers set linkedin_url = $1 where slug = 'or-maccabi'", [good]);
  } catch {
    ok = false;
  }
  check(ok, `linkedin_url accepts ${good}`);
}
await db.exec("update public.speakers set linkedin_url = null where slug = 'or-maccabi'");

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
    await db.query("update public.speakers set photo_url = $1 where slug = 'or-maccabi'", [url]);
  } catch {
    accepted = false;
  }
  check(accepted === ok, `photo_url ${ok ? "accepts" : "rejects"} ${url}`);
}
await db.exec("update public.speakers set photo_url = '/speakers/or-maccabi.webp' where slug = 'or-maccabi'");

for (const [label, sql] of [
  ["insert event", "insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at) select 'x', id, 'x', 'x', now(), now() + interval '1 hour' from public.cohorts"],
  ["update event", "update public.events set title_en = 'hacked'"],
  ["delete venue", "delete from public.venues"],
  ["insert speaker", "insert into public.speakers (slug, name_he, name_en) values ('x', 'x', 'x')"],
  ["set a speaker's LinkedIn", "update public.speakers set linkedin_url = 'https://www.linkedin.com/in/attacker'"],
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

// --- Fixtures (exactly what the app's anon query returns) ----------------------
if (writeFixtures) {
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
  const out = join(root, "src", "lib", "data", "fixtures.json");
  writeFileSync(out, JSON.stringify({ cohort: cohort.rows[0], events: res.rows[0].data }, null, 2) + "\n");
  console.log(`wrote    ${out}`);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
