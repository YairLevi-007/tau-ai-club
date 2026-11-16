// QA's independent Milestone 2 RLS / RPC leak tests. Written from the requirements, not from scripts/rls-m2.mjs.
//   node tests/db/m2-rls.qa.mjs          -> prints PASS/FAIL per check, exits 1 on any failure
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

// ---- Fixtures (inserted as superuser) -------------------------------------------------------------------
const uid = async (email, confirmed = true) =>
  (await db.query(`insert into auth.users (email, email_confirmed_at) values ($1, ${confirmed ? "now()" : "null"}) returning id`, [email])).rows[0].id;
const addMember = async (name, role, emails) => {
  const m = (await db.query(`insert into public.members (full_name, role) values ($1, $2) returning id`, [name, role])).rows[0].id;
  for (const [i, e] of emails.entries()) await db.query(`insert into public.member_emails (email, member_id, is_primary) values ($1, $2, $3)`, [e, m, i === 0]);
  return m;
};
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

// =====================================================================================================
section("1. Identity: who counts as a member");
{
  const isM = async (who) => rowsOf(await run(who, "select public.is_member() m, public.is_admin() a"))[0];
  ok((await isM("anon")).m === false && (await isM("anon")).a === false, "anon: not member, not admin");
  ok((await isM("outsider")).m === false, "signed-in but not allowlisted: not a member");
  ok((await isM("member")).m === true && (await isM("member")).a === false, "allowlisted member: member, not admin");
  ok((await isM("admin")).a === true, "admin: is_admin");
  ok((await isM("secondary")).m === true, "SECONDARY email grants membership");
  ok((await isM("caseDiff")).m === true, "email match is case-insensitive (CaseUser@TAU.test)");
  ok((await isM("unverified")).m === false, "UNVERIFIED email on the allowlist does NOT grant membership");
  // JWT/user mismatch: a valid user id with someone else's email claim.
  const spoof = await as("authenticated", { sub: U.outsider, email: "admin@tau.test" }, "select public.is_member() m, public.is_admin() a");
  ok(rowsOf(spoof)[0]?.m === false && rowsOf(spoof)[0]?.a === false, "JWT email claim that differs from auth.users email is ignored");
  const meta = await as("authenticated", { sub: U.outsider, email: "outsider@tau.test", user_metadata: { email: "admin@tau.test" } }, "select public.is_member() m");
  ok(rowsOf(meta)[0]?.m === false, "user_metadata.email is never trusted");
  const anonJwt = await as("authenticated", { sub: U.member, email: "member@tau.test", is_anonymous: true }, "select public.is_member() m");
  ok(rowsOf(anonJwt)[0]?.m === false, "anonymous-sign-in JWT never counts as a member");
  const nosub = await as("authenticated", { email: "member@tau.test" }, "select public.is_member() m");
  ok(rowsOf(nosub)[0]?.m === false, "JWT without sub never counts as a member");
  // Removing the allowlist row removes access immediately.
  await su(`delete from public.member_emails where email = 'member2@tau.test'`);
  ok(rowsOf(await run("member2", "select public.is_member() m"))[0]?.m === false, "removed from allowlist = access gone on the next call");
  await su(`insert into public.member_emails (email, member_id, is_primary) values ('member2@tau.test', $1, true)`, [M.member2]);

  const cm = async (who) => rowsOf(await run(who, "select * from public.current_member()"));
  ok((await cm("outsider")).length === 0, "current_member(): nothing for outsider");
  ok((await cm("member")).length === 1 && (await cm("member"))[0].full_name === "Member One", "current_member(): only the caller's own row");
  const cl = await run("outsider", "select * from public.claim_membership()");
  ok(rowsOf(cl).length === 0, "claim_membership(): non-member gets nothing");
  ok((await su(`select count(*)::int c from public.profiles where auth_user_id = $1`, [U.outsider]))[0].c === 0, "claim_membership(): no profile created for non-member");
  const first = rowsOf(await run("member", "select * from public.claim_membership()"))[0];
  const second = rowsOf(await run("member", "select * from public.claim_membership()"))[0];
  ok(first?.first_login === true && second?.first_login === false, "claim_membership(): first_login true once, then false");
  ok(rowsOf(await run("unverified", "select * from public.claim_membership()")).length === 0, "claim_membership(): unverified email gets nothing");
}

// =====================================================================================================
section("2. Direct table access: speaker_contacts and tokens are unreachable");
for (const who of ROLES) {
  for (const t of ["speaker_contacts", "speaker_form_tokens"]) {
    const r = await run(who, `select * from public.${t}`);
    ok(denied(r), `[${who}] select * from ${t} fails (permission denied)`, JSON.stringify(r).slice(0, 160));
    const w = await run(who, `insert into public.${t} (speaker_id) values ('${S.a}')`);
    ok(!!w.error, `[${who}] insert into ${t} fails`);
    const u = await run(who, `update public.${t} set speaker_id = speaker_id`);
    ok(!!u.error, `[${who}] update ${t} fails`);
    const d = await run(who, `delete from public.${t}`);
    ok(!!d.error, `[${who}] delete from ${t} fails`);
  }
}
ok((await su(`select count(*)::int c from public.speaker_contacts`))[0].c === 4, "contact rows intact after all attempted writes");

// =====================================================================================================
section("3. Speaker contact RPCs: consent + membership");
{
  const mc = (who, id) => run(who, "select * from public.member_speaker_contact($1)", [id]);
  ok(denied(await mc("anon", S.a)), "anon cannot call member_speaker_contact");
  ok(rowsOf(await mc("outsider", S.a)).length === 0, "non-allowlisted gets NO rows from member_speaker_contact");
  ok(rowsOf(await mc("unverified", S.a)).length === 0, "unverified-email user gets NO rows");
  for (const who of ["outsider", "unverified"]) {
    const blob = JSON.stringify(await mc(who, S.c));
    ok(!blob.includes(C_EMAIL) && !blob.includes(C_PHONE), `[${who}] no email/phone anywhere in the response`);
  }
  const a = rowsOf(await mc("member", S.a))[0];
  ok(a?.email === A_EMAIL && a?.phone == null, "member sees speaker A's consented email, and NO phone (not shared)");
  const c = rowsOf(await mc("member", S.c))[0];
  ok(c?.email === C_EMAIL && c?.phone === C_PHONE && c?.linkedin_url == null, "member sees speaker C's email+phone, no LinkedIn (not shared)");
  // Consent revoked at the data level: flip share flags (as service role) and the member RPC must stop returning the value.
  // (Table checks forbid a stored value without consent, so we test the CASE in the RPC by dropping consent + value together.)
  const bad = await su(`select 1`).then(() => db.query(`update public.speaker_contacts set share_email = false where speaker_id = $1`, [S.a]).then(() => "updated", (e) => e.message));
  ok(/violates check constraint/.test(bad), "DB refuses share_email=false while an email is still stored (no unconsented data at rest)", bad);
  const bad2 = await db.query(`insert into public.speaker_contacts (speaker_id, phone, share_phone, consented_at) values ($1,'+972500000000',false,now()) on conflict (speaker_id) do update set phone = excluded.phone, share_phone = false`, [S.draft]).then(() => "ok", (e) => e.message);
  ok(/violates check constraint/.test(bad2), "DB refuses a phone stored without share_phone", bad2);
  const bad3 = await db.query(`update public.speaker_contacts set linkedin_public = true, share_linkedin = false where speaker_id = $1`, [S.a]).then(() => "ok", (e) => e.message);
  ok(/violates check constraint/.test(bad3), "DB refuses linkedin_public without share_linkedin", bad3);

  // Public LinkedIn
  const pl = (who, id) => run(who, "select * from public.public_speaker_links($1)", [id]);
  for (const who of ["anon", "outsider", "member"]) {
    ok(rowsOf(await pl(who, S.a)).length === 0, `[${who}] LinkedIn NOT public when speaker did not opt in (speaker A)`);
    ok(rowsOf(await pl(who, S.draft)).length === 0, `[${who}] public LinkedIn of a speaker who is only on a DRAFT event is not exposed`);
    ok(rowsOf(await pl(who, S.c)).length === 0, `[${who}] no LinkedIn when none shared (speaker C)`);
  }
  const b = rowsOf(await pl("anon", S.b));
  ok(b.length === 1 && b[0].linkedin_url === B_LI && Object.keys(b[0]).join() === "linkedin_url", "anon sees ONLY linkedin_url for the opted-in speaker B");
  ok(!JSON.stringify(rowsOf(await pl("anon", S.b))).match(/@|phone|\+972/), "public_speaker_links leaks no email/phone");
  // Take B's event to draft: LinkedIn must disappear.
  const bEvents = await su(`select e.id, e.status from public.events e join public.event_speakers es on es.event_id=e.id where es.speaker_id=$1`, [S.b]);
  await su(`update public.events set status='draft' where id = any($1::uuid[])`, [bEvents.map((e) => e.id)]);
  ok(rowsOf(await pl("anon", S.b)).length === 0, "unpublishing the event hides the speaker's public LinkedIn");
  await su(`update public.events set status='published' where id = any($1::uuid[])`, [bEvents.map((e) => e.id)]);

  // Admin overview exposes no values
  const st = await run("admin", "select * from public.admin_speaker_contact_status()");
  ok(!st.error && rowsOf(st).length > 0, "admin can read the contact status overview");
  const stBlob = JSON.stringify(rowsOf(st));
  ok(![A_EMAIL, A_PHONE, A_LI, C_EMAIL, C_PHONE].some((v) => stBlob.includes(v)), "status overview carries no contact VALUES");
  for (const who of ["anon", "outsider", "member"]) {
    const r = await run(who, "select * from public.admin_speaker_contact_status()");
    ok(!!r.error, `[${who}] admin_speaker_contact_status refused`);
  }
}

// =====================================================================================================
section("4. Speaker form tokens: single-use, expiring, hashed");
{
  const sha = (t) => createHash("sha256").update(t).digest("hex");
  for (const who of ["anon", "outsider", "member"]) {
    const r = await run(who, "select * from public.admin_create_speaker_token($1)", [S.a]);
    ok(!!r.error, `[${who}] cannot create a speaker token`);
  }
  const t1 = rowsOf(await run("admin", "select * from public.admin_create_speaker_token($1, 7)", [S.a]))[0];
  ok(/^[0-9a-f]{64}$/.test(t1?.token ?? ""), "admin gets a 64-hex-char token", JSON.stringify(t1));
  const days = (new Date(t1.expires_at) - Date.now()) / 864e5;
  ok(days > 6.9 && days < 7.1, "token expires in the requested 7 days");
  const stored = await su(`select token_hash, used_at from public.speaker_form_tokens where speaker_id=$1`, [S.a]);
  ok(stored.length === 1 && Buffer.from(stored[0].token_hash).toString("hex") === sha(t1.token), "only the SHA-256 hash is stored");
  const dump = JSON.stringify(await su(`select t::text from public.speaker_form_tokens t`));
  ok(!dump.includes(t1.token), "raw token appears nowhere in the table");
  for (const bad of [0, 61, -1]) {
    const r = await run("admin", "select * from public.admin_create_speaker_token($1, $2)", [S.a, bad]);
    ok(!!r.error, `token validity ${bad} days rejected`);
  }
  ok(!!(await run("admin", "select * from public.admin_create_speaker_token($1)", ["00000000-0000-0000-0000-000000000000"])).error, "token for unknown speaker rejected");

  // Regenerating invalidates the old link
  const t2 = rowsOf(await run("admin", "select * from public.admin_create_speaker_token($1)", [S.a]))[0];
  ok(rowsOf(await run("anon", "select * from public.speaker_form_info($1)", [t1.token])).length === 0, "older link is dead once a new one is issued");
  ok(rowsOf(await run("anon", "select * from public.speaker_form_info($1)", [t2.token])).length === 1, "new link is valid");

  // Invalid shapes never match
  for (const junk of [null, "", "abc", "0".repeat(63), "0".repeat(65), t2.token.toUpperCase(), "' or 1=1 --" + "x".repeat(60), t2.token.slice(0, 63) + "z"]) {
    const info = await run("anon", "select * from public.speaker_form_info($1)", [junk]);
    const sub = await run("anon", "select public.submit_speaker_contact($1,true,true,'x@y.zz',false,null,false,null,false)", [junk]);
    ok(rowsOf(info).length === 0 && !!sub.error, `junk token ${JSON.stringify(String(junk).slice(0, 12))} is rejected by info and submit`);
  }

  // Submit without consent: rejected, token still usable afterwards
  const noConsent = await run("anon", "select public.submit_speaker_contact($1,false,true,'a@b.cc',false,null,false,null,false)", [t2.token]);
  ok(!!noConsent.error, "submit without consent is rejected");
  ok((await su(`select count(*)::int c from public.speaker_contacts where speaker_id=$1 and email = 'a@b.cc'`, [S.a]))[0].c === 0, "nothing stored when consent missing");
  ok(rowsOf(await run("anon", "select * from public.speaker_form_info($1)", [t2.token])).length === 1, "failed submit does not burn the token");
  // Shared-but-empty field rejected
  ok(!!(await run("anon", "select public.submit_speaker_contact($1,true,true,'',false,null,false,null,false)", [t2.token])).error, "share_email=true with empty email rejected");
  // Bad formats rejected by constraints
  for (const [label, args] of [
    ["email without @", "true,'not-an-email',false,null,false,null,false"],
    ["phone with letters", "false,null,true,'call me maybe',false,null,false"],
    ["LinkedIn on http://", "false,null,false,null,true,'http://linkedin.com/in/x',false"],
    ["LinkedIn on another domain", "false,null,false,null,true,'https://evil.example/linkedin.com/in/x',false"],
    ["javascript: LinkedIn", "false,null,false,null,true,'javascript:alert(1)',false"],
  ]) {
    const r = await run("anon", `select public.submit_speaker_contact($1,true,${args})`, [t2.token]);
    ok(!!r.error, `submit rejects ${label}`);
  }
  ok(rowsOf(await run("anon", "select * from public.speaker_form_info($1)", [t2.token])).length === 1, "token still valid after rejected submissions");

  // Happy path: consent to email + public LinkedIn, but phone supplied and NOT shared -> must not be stored
  const good = await run(
    "anon",
    "select public.submit_speaker_contact($1,true,true,'New.Speaker@Example.com',false,'+972501112222',true,'https://il.linkedin.com/in/new-speaker',true)",
    [t2.token],
  );
  ok(!good.error, "valid submission accepted", good.error);
  const row = (await su(`select * from public.speaker_contacts where speaker_id=$1`, [S.a]))[0];
  ok(row.email === "new.speaker@example.com", "email stored (normalised)");
  ok(row.phone === null && row.share_phone === false, "UNCONSENTED phone was NOT stored even though the client sent it");
  ok(row.share_linkedin && row.linkedin_public && row.linkedin_url === "https://il.linkedin.com/in/new-speaker", "LinkedIn stored with public flag as chosen");
  ok(!!row.consented_at && Date.now() - new Date(row.consented_at) < 60_000, "consented_at set by the server");
  ok(rowsOf(await run("anon", "select * from public.speaker_form_info($1)", [t2.token])).length === 0, "link no longer valid after use");
  const again = await run("anon", "select public.submit_speaker_contact($1,true,true,'evil@x.yy',false,null,false,null,false)", [t2.token]);
  ok(!!again.error, "token is SINGLE-USE: second submit rejected");
  ok((await su(`select email from public.speaker_contacts where speaker_id=$1`, [S.a]))[0].email === "new.speaker@example.com", "second submit did not overwrite the data");
  // Public LinkedIn now follows the speaker's choice
  const pub = rowsOf(await run("anon", "select * from public.public_speaker_links($1)", [S.a]));
  ok(pub.length === 1 && pub[0].linkedin_url === "https://il.linkedin.com/in/new-speaker", "opt-in public LinkedIn becomes visible to anon");
  const mem = rowsOf(await run("member", "select * from public.member_speaker_contact($1)", [S.a]))[0];
  ok(mem.email === "new.speaker@example.com" && mem.phone == null, "member sees exactly the consented fields after submit");

  // Expiry
  const t3 = rowsOf(await run("admin", "select * from public.admin_create_speaker_token($1, 1)", [S.b]))[0];
  await su(`update public.speaker_form_tokens set created_at = now() - interval '3 days', expires_at = now() - interval '1 minute' where token_hash = sha256(convert_to($1,'UTF8'))`, [t3.token]);
  ok(rowsOf(await run("anon", "select * from public.speaker_form_info($1)", [t3.token])).length === 0, "EXPIRED token: form info refused");
  ok(!!(await run("anon", "select public.submit_speaker_contact($1,true,true,'late@x.yy',false,null,false,null,false)", [t3.token])).error, "EXPIRED token: submit refused");
  // Revoke
  const t4 = rowsOf(await run("admin", "select * from public.admin_create_speaker_token($1)", [S.c]))[0];
  ok(!!(await run("member", "select public.admin_revoke_speaker_tokens($1)", [S.c])).error, "member cannot revoke tokens");
  ok(rowsOf(await run("anon", "select * from public.speaker_form_info($1)", [t4.token])).length === 1, "failed revoke by member left the link alive");
  await run("admin", "select public.admin_revoke_speaker_tokens($1)", [S.c]);
  ok(rowsOf(await run("anon", "select * from public.speaker_form_info($1)", [t4.token])).length === 0, "admin revoke kills the link");
  // Delete contact
  ok(!!(await run("member", "select public.admin_delete_speaker_contact($1)", [S.c])).error, "member cannot delete speaker contact data");
  await run("admin", "select public.admin_delete_speaker_contact($1)", [S.c]);
  ok((await su(`select count(*)::int c from public.speaker_contacts where speaker_id=$1`, [S.c]))[0].c === 0, "admin can hard-delete a speaker's contact data");
  ok(rowsOf(await run("member", "select * from public.member_speaker_contact($1)", [S.c])).length === 0, "deleted contact is gone for members too");
}

// =====================================================================================================
section("5. Writes: only admins change content, members or the allowlist");
{
  const evId = (await su(`select id from public.events where slug='zero-to-hero-1'`))[0].id;
  const cohort = (await su(`select id from public.cohorts limit 1`))[0].id;
  const writers = {
    "insert event": `insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at, status) values ('qa-hack','${cohort}','x','x',now(),now()+interval '1 hour','published')`,
    "update event": `update public.events set title_en='HACKED' where id='${evId}'`,
    "delete event": `delete from public.events where id='${evId}'`,
    "update speaker": `update public.speakers set name_en='HACKED' where id='${S.a}'`,
    "update venue": `update public.venues set name_en='HACKED'`,
    "insert member": `insert into public.members (full_name) values ('Mallory')`,
    "promote self": `update public.members set role='admin' where id='${M.member}'`,
    "add own email to allowlist": `insert into public.member_emails (email, member_id) values ('outsider@tau.test','${M.member}')`,
    "delete allowlist": `delete from public.member_emails`,
    "delete members": `delete from public.members`,
  };
  for (const who of ["anon", "outsider", "unverified", "member"]) {
    for (const [label, sql] of Object.entries(writers)) {
      const r = await run(who, sql);
      const changed = !r.error && (r.count ?? 0) > 0;
      ok(!changed, `[${who}] ${label}: refused or affects 0 rows`, JSON.stringify(r).slice(0, 120));
    }
  }
  ok((await su(`select title_en from public.events where id=$1`, [evId]))[0].title_en === "Zero to Hero 1: Claude", "event untouched after non-admin attempts");
  ok((await su(`select role from public.members where id=$1`, [M.member]))[0].role === "member", "member could not promote themself");
  ok((await su(`select count(*)::int c from public.member_emails`))[0].c >= 8, "allowlist untouched");
  ok(rowsOf(await run("member", "select * from public.members")).length === 0, "plain member cannot read the members table");
  ok(rowsOf(await run("member", "select * from public.member_emails")).length === 0, "plain member cannot read the allowlist (emails)");
  ok(rowsOf(await run("outsider", "select * from public.members")).length === 0, "outsider cannot read members");
  ok(denied(await run("anon", "select * from public.member_emails")) && denied(await run("anon", "select * from public.members")), "anon: permission denied on members + allowlist");
  // Draft content visibility
  ok(!JSON.stringify(rowsOf(await run("anon", "select slug from public.events"))).includes("draft-event"), "anon cannot see draft events");
  ok(!JSON.stringify(rowsOf(await run("member", "select slug from public.events"))).includes("draft-event"), "plain member cannot see draft events");
  ok(JSON.stringify(rowsOf(await run("admin", "select slug from public.events"))).includes("draft-event"), "admin can see draft events");

  // Admin positive controls
  ok(!(await run("admin", `update public.events set title_en='Zero to Hero 1: Claude' where id='${evId}'`)).error, "admin can update an event");
  const ins = await run("admin", `insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at, status) values ('qa-new','${cohort}','x','x',now(),now()+interval '1 hour','draft')`);
  ok(!ins.error, "admin can insert an event", ins.error);
  ok(!(await run("admin", `delete from public.events where slug='qa-new'`)).error, "admin can delete an event");
  const add = await run("admin", "select public.admin_add_member('New.Person@TAU.test', ' New Person ')");
  ok(!add.error, "admin_add_member works", add.error);
  ok((await su(`select email::text e from public.member_emails where email='new.person@tau.test'`)).length === 1, "added member's email stored lower-cased");
  ok(!!(await run("admin", "select public.admin_add_member('member@tau.test','Dup')")).error, "duplicate allowlist email rejected");
  ok((await su(`select count(*)::int c from public.members where full_name='Dup'`))[0].c === 0, "failed add left no orphan member row");
  ok(!!(await run("admin", "select public.admin_add_member('no-at-sign','X')")).error, "malformed email rejected by admin_add_member");
  for (const who of ["anon", "outsider", "member"]) {
    ok(!!(await run(who, "select public.admin_add_member('x@y.zz','X')")).error, `[${who}] admin_add_member refused`);
    ok(!!(await run(who, "select * from public.admin_import_members('[]'::jsonb)")).error, `[${who}] admin_import_members refused`);
  }
  // Import: atomic, validated
  const before = (await su(`select count(*)::int c from public.members`))[0].c;
  const badImport = await run("admin", `select * from public.admin_import_members('[{"email":"ok1@tau.test","full_name":"Ok One"},{"email":"bad","full_name":"Bad"}]'::jsonb)`);
  ok(!!badImport.error && /row 2/.test(badImport.error), "import: bad row aborts with its row number", badImport.error);
  ok((await su(`select count(*)::int c from public.members`))[0].c === before, "import is all-or-nothing (row 1 not committed)");
  ok(!!(await run("admin", `select * from public.admin_import_members('[{"email":"r@tau.test","full_name":"R","role":"owner"}]'::jsonb)`)).error, "import rejects unknown role");
  ok(!!(await run("admin", `select * from public.admin_import_members('{"a":1}'::jsonb)`)).error, "import rejects non-array JSON");
  const goodImport = rowsOf(await run("admin", `select * from public.admin_import_members('[{"email":"Imp1@tau.test","full_name":"Imp One"},{"email":"member@tau.test","full_name":"Member Renamed"}]'::jsonb)`))[0];
  ok(goodImport?.inserted === 1 && goodImport?.updated === 1, "import: 1 inserted, 1 updated", JSON.stringify(goodImport));
  const big = JSON.stringify(Array.from({ length: 2001 }, (_, i) => ({ email: `b${i}@tau.test`, full_name: "B" })));
  ok(!!(await run("admin", "select * from public.admin_import_members($1::jsonb)", [big])).error, "import caps at 2000 rows");
  // Last-admin guard
  const del = await db.query(`update public.members set role='member' where id=$1`, [M.admin2]).then(() => "ok", (e) => e.message);
  ok(del === "ok", "with two admins one can be demoted");
  const last = await db.query(`update public.members set role='member' where id=$1`, [M.admin]).then(() => "ok", (e) => e.message);
  ok(/last admin/.test(last), "the LAST admin cannot be demoted", last);
  const lastDel = await db.query(`delete from public.members where id=$1`, [M.admin]).then(() => "ok", (e) => e.message);
  ok(/last admin/.test(lastDel), "the LAST admin cannot be deleted", lastDel);
  await su(`update public.members set role='admin' where id=$1`, [M.admin2]);
}

// =====================================================================================================
section("6. Profiles");
{
  await su(`insert into public.profiles (member_id) values ($1), ($2) on conflict do nothing`, [M.member, M.member2]);
  ok(denied(await run("anon", "select * from public.profiles")), "anon: profiles permission denied");
  ok(rowsOf(await run("outsider", "select * from public.profiles")).length === 0, "outsider reads zero profiles");
  ok(rowsOf(await run("member", "select * from public.profiles")).length >= 2, "member can read profiles");
  const own = await run("member", `update public.profiles set bio_en='hello' where member_id='${M.member}'`);
  ok(!own.error && own.count === 1, "member edits own profile");
  const other = await run("member", `update public.profiles set bio_en='pwned' where member_id='${M.member2}'`);
  ok(!other.error && (other.count ?? 0) === 0, "member cannot edit another member's profile (0 rows)");
  for (const col of ["member_id", "auth_user_id", "welcomed_at"]) {
    const v = col === "welcomed_at" ? "now()" : col === "auth_user_id" ? `'${U.admin}'` : `'${M.admin}'`;
    ok(!!(await run("member", `update public.profiles set ${col}=${v} where member_id='${M.member}'`)).error, `member cannot change profiles.${col} (column privilege)`);
  }
  ok(!!(await run("member", `update public.profiles set photo_url='http://insecure.example/x.png' where member_id='${M.member}'`)).error, "profile photo must be https");
  ok(!!(await run("member", `delete from public.profiles where member_id='${M.member}'`)).error || true, "(info) member profile delete attempt executed");
  ok((await su(`select count(*)::int c from public.profiles where member_id=$1`, [M.member]))[0].c === 1, "member could not delete their profile");
}

// =====================================================================================================
section("7. Privilege audit (catalog)");
{
  const tables = (await su(`select c.relname, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1`));
  ok(tables.every((t) => t.rls), "RLS enabled on EVERY public table", tables.filter((t) => !t.rls).map((t) => t.relname).join());
  for (const t of tables) {
    const w = (await su(`select has_table_privilege('anon', 'public.${t.relname}', 'INSERT') i, has_table_privilege('anon','public.${t.relname}','UPDATE') u, has_table_privilege('anon','public.${t.relname}','DELETE') d`))[0];
    ok(!w.i && !w.u && !w.d, `anon has no write privilege on ${t.relname}`);
  }
  const sens = ["members", "member_emails", "profiles", "speaker_contacts", "speaker_form_tokens"];
  for (const t of sens) {
    ok(!(await su(`select has_table_privilege('anon','public.${t}','SELECT') s`))[0].s, `anon has no SELECT on ${t}`);
  }
  for (const t of ["speaker_contacts", "speaker_form_tokens"])
    ok(!(await su(`select has_table_privilege('authenticated','public.${t}','SELECT') s`))[0].s, `authenticated has no SELECT on ${t}`);
  // Which public functions can anon / authenticated execute? Anything outside the expected list is a finding.
  const ANON_OK = new Set(["current_member_id", "is_member", "is_admin", "public_speaker_links", "speaker_form_info", "submit_speaker_contact"]);
  const AUTH_OK = new Set([...ANON_OK, "current_member", "claim_membership", "member_speaker_contact", "admin_add_member", "admin_import_members", "admin_create_speaker_token", "admin_revoke_speaker_tokens", "admin_delete_speaker_contact", "admin_speaker_contact_status", "avatar_owner_folder", "update_my_name", "member_directory", "member_profile", "admin_save_event", "admin_import_attendance"]);
  const fns = await su(`select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u
                        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prorettype <> 'trigger'::regtype order by 1`); // trigger functions can't be called directly (info: set_updated_at has default EXECUTE grants)
  const anonExtra = fns.filter((f) => f.a && !ANON_OK.has(f.proname)).map((f) => f.proname);
  const authExtra = fns.filter((f) => f.u && !AUTH_OK.has(f.proname)).map((f) => f.proname);
  ok(anonExtra.length === 0, "anon can EXECUTE only the intended functions", anonExtra.join());
  ok(authExtra.length === 0, "authenticated can EXECUTE only the intended functions", authExtra.join());
  const defs = await su(`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef`);
  const noPath = defs.filter((d) => !(d.proconfig ?? []).some((c) => /^search_path=/.test(c))).map((d) => d.proname);
  ok(noPath.length === 0, "every SECURITY DEFINER function pins search_path", noPath.join());
  // Views must not bypass RLS
  const views = await su(`select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'`);
  ok(views.every((v) => (v.reloptions ?? []).some((o) => /security_invoker=(true|on)/.test(o))), "every public view is security_invoker", views.map((v) => v.relname).join());
}

// =====================================================================================================
section("8. Profiles (part 2): photo + links constraints, own-name RPC, directory");
{
  const own = (m) => `https://x.supabase.co/storage/v1/object/authenticated/avatars/${m}/me.jpg`;
  const setPhoto = (who, m, url) => run(who, `update public.profiles set photo_url = '${url}' where member_id = '${m}'`);
  ok(!(await setPhoto("member", M.member, own(M.member))).error, "member can point photo_url at their OWN avatar folder");
  ok(!!(await setPhoto("member", M.member, own(M.member2))).error, "member CANNOT point photo_url at another member's folder");
  ok(!!(await setPhoto("member", M.member, "https://evil.example/x.jpg")).error, "photo_url must be a storage URL in the avatars bucket");
  for (const [label, links] of [
    ["unknown key", `{"twitter":"https://x.com/a"}`],
    ["http LinkedIn", `{"linkedin":"http://linkedin.com/in/a"}`],
    ["javascript: website", `{"website":"javascript:alert(1)"}`],
    ["LinkedIn on another domain", `{"linkedin":"https://evil.example/linkedin.com/in/a"}`],
    ["non-github github", `{"github":"https://evil.example/a"}`],
  ])
    ok(!!(await run("member", `update public.profiles set links = '${links}'::jsonb where member_id='${M.member}'`)).error, `links rejected: ${label}`);
  ok(
    !(await run("member", `update public.profiles set links = '{"linkedin":"https://www.linkedin.com/in/a","github":"https://github.com/a","website":"https://example.com/a"}'::jsonb where member_id='${M.member}'`)).error,
    "valid links accepted",
  );

  ok(!!(await run("anon", "select public.update_my_name('X')")).error, "anon: update_my_name refused");
  ok(!!(await run("outsider", "select public.update_my_name('Mallory')")).error, "outsider: update_my_name refused");
  ok(!!(await run("unverified", "select public.update_my_name('Mallory')")).error, "unverified: update_my_name refused");
  ok(
    !(await run("member", "select public.update_my_name('  New Name  ')")).error && (await su(`select full_name from public.members where id=$1`, [M.member]))[0].full_name === "New Name",
    "member renames themself (trimmed)",
  );
  ok((await su(`select full_name from public.members where id=$1`, [M.member2]))[0].full_name === "Member Two", "renaming does not touch other members");
  for (const bad of ["''", `'${"x".repeat(121)}'`, "null"]) ok(!!(await run("member", `select public.update_my_name(${bad})`)).error, `update_my_name rejects ${bad.slice(0, 12)}`);

  ok(!!(await run("anon", "select * from public.member_directory()")).error, "anon: member_directory refused");
  ok(rowsOf(await run("outsider", "select * from public.member_directory()")).length === 0, "outsider: member_directory empty");
  ok(rowsOf(await run("unverified", "select * from public.member_directory()")).length === 0, "unverified: member_directory empty");
  const dir = rowsOf(await run("member", "select * from public.member_directory()"));
  ok(dir.length >= 5, "member sees the directory");
  ok(!Object.keys(dir[0] ?? {}).some((k) => /email|role|phone/i.test(k)), "directory exposes no email/role/phone columns");
  ok(!!(await run("anon", "select * from public.member_profile($1)", [M.member2])).error, "anon: member_profile refused");
  ok(rowsOf(await run("outsider", "select * from public.member_profile($1)", [M.member2])).length === 0, "outsider: member_profile empty");
  const mp = rowsOf(await run("member", "select * from public.member_profile($1)", [M.member2]))[0];
  ok(mp && mp.is_self === false && !Object.keys(mp).some((k) => /email|role|phone/i.test(k)), "member_profile: no email/role/phone, is_self=false for others");
  ok(rowsOf(await run("member", "select * from public.member_profile($1)", [M.member]))[0]?.is_self === true, "member_profile: is_self=true for own");
  for (const who of ["anon", "outsider", "member"]) ok(!!(await run(who, "select public.admin_save_event('{}'::jsonb)")).error, `[${who}] admin_save_event refused`);
}

// =====================================================================================================
section("9. Storage: avatars bucket");
{
  const b = (await su(`select * from storage.buckets where id='avatars'`))[0];
  ok(b && b.public === false, "avatars bucket exists and is PRIVATE");
  ok(b?.file_size_limit > 0 && b.file_size_limit <= 5 * 1024 * 1024, "avatars bucket has a size limit <= 5 MB", String(b?.file_size_limit));
  ok(Array.isArray(b?.allowed_mime_types) && b.allowed_mime_types.every((m) => /^image\/(jpeg|png|webp)$/.test(m)), "avatars bucket only allows jpeg/png/webp (no svg/html)", JSON.stringify(b?.allowed_mime_types));
  await su(`insert into storage.buckets (id, name, public) values ('private-other','private-other',false) on conflict do nothing`);
  await su(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2), ('private-other', 'secret.txt')`, [`${M.member2}/face.jpg`, `${M.member}/old.jpg`]);
  const list = (who) => run(who, `select name from storage.objects where bucket_id='avatars'`);
  ok(rowsOf(await list("anon")).length === 0, "guest (anon) sees NO avatar objects");
  for (const who of ["outsider", "unverified"]) ok(rowsOf(await list(who)).length === 0, `[${who}] sees NO avatar objects`);
  ok(rowsOf(await list("member")).length >= 2, "member can read avatars (all folders)");
  ok(rowsOf(await run("member", `select name from storage.objects where bucket_id='private-other'`)).length === 0, "member cannot read other buckets (no policy)");
  const objs = (who, name, bucket = "avatars") => run(who, `insert into storage.objects (bucket_id, name) values ('${bucket}', '${name}')`);
  ok(!!(await objs("anon", `${M.member}/a.jpg`)).error, "guest cannot upload");
  ok(!!(await objs("outsider", `${M.member}/a.jpg`)).error, "outsider cannot upload even into a member's folder");
  ok(!!(await objs("unverified", `${M.victim}/a.jpg`)).error, "unverified-email user cannot upload into the victim's folder");
  ok(!(await objs("member", `${M.member}/new.jpg`)).error, "member uploads into OWN folder");
  ok(!!(await objs("member", `${M.member2}/evil.jpg`)).error, "member CANNOT upload into another member's folder");
  ok(!!(await objs("member", `evil.jpg`)).error, "member cannot upload at the bucket root");
  ok(!!(await objs("member", `/${M.member}/x.jpg`)).error, "leading-slash name does not bypass the folder rule");
  ok(!!(await objs("member", `${M.member}/x.jpg`, "private-other")).error, "member cannot upload into another bucket");
  const trav = await objs("member", `${M.member}/../${M.member2}/traversal.jpg`);
  console.log(`INFO  object name "<me>/../<other>/x" ${trav.error ? "refused" : "ACCEPTED by the SQL policy (real Supabase Storage rejects '..' segments; verify there)"}`);
  await su(`delete from storage.objects where name like '%traversal.jpg'`);
  const upd = (who, name) => run(who, `update storage.objects set owner_id = 'x' where bucket_id='avatars' and name = '${name}'`);
  ok(((await upd("member", `${M.member}/old.jpg`)).count ?? 0) === 1, "member can replace own object");
  ok(((await upd("member", `${M.member2}/face.jpg`)).count ?? 0) === 0, "member cannot replace another member's object");
  const mv = await run("member", `update storage.objects set name='${M.member}/stolen.jpg' where name='${M.member2}/face.jpg'`);
  ok(!!mv.error || (mv.count ?? 0) === 0, "member cannot move another member's object into their own folder");
  const mv2 = await run("member", `update storage.objects set name='${M.member2}/planted.jpg' where name='${M.member}/new.jpg'`);
  ok(!!mv2.error || (mv2.count ?? 0) === 0, "member cannot move their own object into another member's folder");
  const del = (who, name) => run(who, `delete from storage.objects where bucket_id='avatars' and name = '${name}'`);
  ok(((await del("outsider", `${M.member2}/face.jpg`)).count ?? 0) === 0, "outsider cannot delete");
  ok(((await del("member", `${M.member2}/face.jpg`)).count ?? 0) === 0, "member cannot delete another member's photo");
  ok(((await del("member", `${M.member}/old.jpg`)).count ?? 0) === 1, "member deletes own photo");
  ok(!!(await objs("admin", `${M.member2}/by-admin.jpg`)).error, "admin cannot UPLOAD into someone else's folder (only delete)");
  ok(((await del("admin", `${M.member2}/face.jpg`)).count ?? 0) === 1, "admin can delete any photo");
  const bl = await run("anon", "select * from storage.buckets");
  ok(denied(bl) || rowsOf(bl).length === 0, "guest sees no bucket list");
}

// =====================================================================================================
section("10. Content writes are admin-only; drafts invisible");
{
  const cohort = (await su(`select id from public.cohorts limit 1`))[0].id;
  const venue = (await su(`select id from public.venues limit 1`))[0].id;
  const evZ = (await su(`select id from public.events where slug='zero-to-hero-2'`))[0].id;
  const attempts = {
    "insert venue": `insert into public.venues (name_he, name_en) values ('x','x')`,
    "update venue": `update public.venues set name_en='HACKED'`,
    "delete venue": `delete from public.venues where id='${venue}'`,
    "insert speaker": `insert into public.speakers (slug, name_he, name_en) values ('qa-evil','x','x')`,
    "update speaker": `update public.speakers set name_en='HACKED'`,
    "delete speaker": `delete from public.speakers where id='${S.b}'`,
    "update line-up": `update public.event_speakers set sort = 9`,
    "delete line-up": `delete from public.event_speakers`,
    "insert line-up": `insert into public.event_speakers (event_id, speaker_id) values ('${evZ}','${S.a}')`,
    "update cohort": `update public.cohorts set name_en='HACKED'`,
    "publish a draft": `update public.events set status='published' where slug='draft-event'`,
  };
  for (const who of ["anon", "outsider", "unverified", "member"])
    for (const [label, sql] of Object.entries(attempts)) {
      const r = await run(who, sql);
      ok(!(!r.error && (r.count ?? 0) > 0), `[${who}] ${label}: refused or 0 rows`, JSON.stringify(r).slice(0, 100));
    }
  ok(
    (await su(`select count(*)::int c from public.venues where name_en='HACKED'`))[0].c === 0 &&
      (await su(`select count(*)::int c from public.speakers where name_en='HACKED' or slug='qa-evil'`))[0].c === 0,
    "no venue/speaker/cohort change leaked through",
  );
  ok((await su(`select status from public.events where slug='draft-event'`))[0].status === "draft", "draft stayed a draft");

  ok(!(await run("admin", "insert into public.venues (name_he, name_en) values ('qa','QA Hall')")).error, "admin can insert a venue");
  ok(((await run("admin", "update public.venues set name_en='QA Hall 2' where name_en='QA Hall'")).count ?? 0) === 1, "admin can update a venue");
  ok(!(await run("admin", "insert into public.speakers (slug, name_he, name_en) values ('qa-speaker','ק','QA Speaker')")).error, "admin can insert a speaker");
  ok(((await run("admin", "delete from public.speakers where slug='qa-speaker'")).count ?? 0) === 1, "admin can delete a speaker");

  const base = (o = {}) =>
    JSON.stringify({
      slug: "qa-saved", cohort_id: cohort, kind: "lecture", title_he: "כ", title_en: "QA saved",
      starts_at: "2027-03-03T18:00:00+02:00", ends_at: "2027-03-03T20:00:00+02:00", is_tentative: false, status: "draft",
      speaker_ids: [S.b, S.a], ...o,
    });
  const save = (who, j) => run(who, "select public.admin_save_event($1::jsonb) id", [j]);
  const created = await save("admin", base());
  ok(!created.error, "admin_save_event creates an event", created.error);
  const id = rowsOf(created)[0]?.id;
  const lineup = async () => (await su(`select s.slug from public.event_speakers es join public.speakers s on s.id=es.speaker_id where es.event_id=$1 order by es.sort`, [id])).map((r) => r.slug);
  ok(JSON.stringify(await lineup()) === JSON.stringify(["oz", "shai-yahel"]), "line-up saved in the given order", JSON.stringify(await lineup()));
  const badUpdate = await save("admin", base({ id, ends_at: "2027-03-03T17:00:00+02:00", speaker_ids: [S.c] }));
  ok(!!badUpdate.error, "update with ends_at before starts_at is rejected");
  ok(JSON.stringify(await lineup()) === JSON.stringify(["oz", "shai-yahel"]), "failed update left the line-up untouched (atomic)");
  ok(!!(await save("admin", base({ id, slug: "Bad Slug!" }))).error, "bad slug rejected");
  ok(!!(await save("admin", base({ id: "00000000-0000-0000-0000-000000000000" }))).error, "unknown event id rejected");
  ok(!!(await save("admin", base({ luma_url: "javascript:alert(1)" }))).error, "non-https luma_url rejected");
  ok(!!(await save("admin", base({ speaker_ids: "nope" }))).error, "speaker_ids must be an array");

  const vis = async (who) => JSON.stringify(rowsOf(await run(who, "select slug from public.events")));
  for (const who of ["anon", "outsider", "member"]) {
    const v = await vis(who);
    ok(!v.includes("qa-saved") && !v.includes("draft-event"), `[${who}] cannot list draft events`);
    ok(rowsOf(await run(who, "select * from public.events where slug='draft-event'")).length === 0, `[${who}] cannot fetch a draft by slug`);
  }
  for (const who of ["anon", "member"]) {
    ok(rowsOf(await run(who, `select * from public.event_speakers where event_id=$1`, [id])).length === 0, `[${who}] cannot see the line-up of a draft`);
    ok(rowsOf(await run(who, "select * from public.speakers where slug='secret-speaker'")).length === 0, `[${who}] cannot see a speaker who is only on a draft`);
    const emb = JSON.stringify(rowsOf(await run(who, "select e.slug, (select json_agg(s.slug) from public.event_speakers es join public.speakers s on s.id=es.speaker_id where es.event_id=e.id) from public.events e")));
    ok(!emb.includes("secret-speaker"), `[${who}] draft-only speaker does not surface through joins`);
  }
  ok((await vis("admin")).includes("qa-saved"), "admin sees drafts");
  await save("admin", base({ id, status: "published" }));
  ok((await vis("anon")).includes("qa-saved"), "publishing makes it visible to guests");
  await save("admin", base({ id, status: "draft" }));
  ok(!(await vis("anon")).includes("qa-saved"), "un-publishing hides it again");

  await su(`insert into public.venues (name_he, name_en) values ('x','Hidden Draft Venue')`);
  await su(`update public.events set venue_id=(select id from public.venues where name_en='Hidden Draft Venue') where slug='draft-event'`);
  const hv = JSON.stringify(rowsOf(await run("anon", "select name_en from public.venues")));
  console.log(`INFO  venue used only by a draft event is ${hv.includes("Hidden Draft Venue") ? "VISIBLE to guests (venues are read-all; low sensitivity, but reveals a planned venue)" : "hidden from guests"}`);
}

// =====================================================================================================
section("11. Attendance (Luma guest CSV import)");
{
  const evPast = (await su(`select id from public.events where slug='cohort-02-opening'`))[0].id; // ended in the fixed seed? use explicit dates below
  // Make deterministic events: one that has ended, one in the future.
  const cohort = (await su(`select id from public.cohorts limit 1`))[0].id;
  const mk = async (slug, start, end) =>
    (await su(`insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at, status) values ($1,$2,'x','x',$3,$4,'published') returning id`, [slug, cohort, start, end]))[0].id;
  const E = {
    past: await mk("qa-att-past", "2026-01-01T16:00:00Z", "2026-01-01T18:00:00Z"),
    future: await mk("qa-att-future", "2099-01-01T16:00:00Z", "2099-01-01T18:00:00Z"),
  };
  void evPast;
  const imp = (who, ev, rows, commit = false) => run(who, "select public.admin_import_attendance($1, $2::jsonb, $3) r", [ev, JSON.stringify(rows), commit]);
  const rows = [
    { email: "Member@TAU.test", going: true, checked_in: true, checked_in_at: "2026-01-01T16:05:00Z" }, // primary email (renamed member One)
    { email: "alt.member3@gmail.com", going: true, checked_in: false }, // member 3 via SECONDARY email
    { email: "primary.member3@tau.test", going: true, checked_in: true, checked_in_at: "2026-01-01T16:10:00Z" }, // same member 3, second address
    { email: "member2@tau.test", going: false, checked_in: false }, // declined/waitlist: ignored
    { email: "stranger@guest.example", going: true, checked_in: true, checked_in_at: "2026-01-01T16:20:00Z" }, // non-member
    { email: "stranger2@guest.example", going: true, checked_in: false },
    { email: "not-an-email", going: true, checked_in: true },
    { email: "", going: true },
    { email: "walkin@guest.example", going: false, checked_in: true }, // checked in without registration: counts
  ];

  // --- who may call it
  for (const who of ["anon", "outsider", "unverified", "member"]) ok(!!(await imp(who, E.past, rows, true)).error, `[${who}] admin_import_attendance refused`);
  ok((await su(`select count(*)::int c from public.attendance`))[0].c === 0, "refused calls wrote nothing");

  // --- preview does not write
  const pv = rowsOf(await imp("admin", E.past, rows, false))[0]?.r;
  ok(!!pv && pv.committed === false, "admin preview works");
  ok((await su(`select count(*)::int c from public.attendance`))[0].c === 0 && (await su(`select count(*)::int c from public.attendance_imports`))[0].c === 0, "preview (commit=false) writes nothing");
  const byName = Object.fromEntries((pv?.members ?? []).map((m) => [m.full_name, m.status]));
  ok(byName["New Name"] === "checked_in", "primary email, case-insensitive, matched and checked in", JSON.stringify(byName));
  ok(Object.keys(byName).filter((k) => k === "Member Three").length === 1 && byName["Member Three"] === "checked_in", "a member who registered with two addresses (incl. secondary) yields ONE row, checked_in wins");
  ok(!("Member Two" in byName), "declined/waitlist row (going=false, not checked in) is ignored");
  ok(pv.rows_total === rows.length && pv.ignored === 3, "rows_total counts all rows; ignored = declined + invalid + empty", JSON.stringify({ t: pv.rows_total, i: pv.ignored }));
  ok(pv.guests_registered === 3 && pv.guests_checked_in === 2, "non-member counts: registered 3 (distinct emails), checked-in 2", JSON.stringify({ r: pv.guests_registered, c: pv.guests_checked_in }));
  ok(!JSON.stringify(pv).match(/guest\.example|stranger|walkin/), "preview response contains no non-member email");

  // --- no_show only after the event ended
  const futurePreview = rowsOf(await imp("admin", E.future, [{ email: "member2@tau.test", going: true, checked_in: false }], false))[0].r;
  ok(futurePreview.members[0]?.status === "registered", "before the event ends, going-but-not-checked-in is 'registered'");
  const pastPreview = rowsOf(await imp("admin", E.past, [{ email: "member2@tau.test", going: true, checked_in: false }], false))[0].r;
  ok(pastPreview.members[0]?.status === "no_show", "after the event ended, going-but-not-checked-in is 'no_show'");
  const early = rowsOf(await imp("admin", E.future, [{ email: "member2@tau.test", going: false, checked_in_at: "2099-01-01T16:01:00Z" }], false))[0].r;
  ok(early.members[0]?.status === "checked_in", "a check-in timestamp alone counts as checked in");

  // --- commit
  const cm = await imp("admin", E.past, rows, true);
  ok(!cm.error, "admin commit works", cm.error);
  const att = await su(`select m.full_name, a.status, a.checked_in_at from public.attendance a join public.members m on m.id=a.member_id where a.event_id=$1 order by 1`, [E.past]);
  ok(att.length === 2, "only MEMBERS are stored (2 rows)", JSON.stringify(att));
  const dump = JSON.stringify(await su(`select a::text from public.attendance a`)) + JSON.stringify(await su(`select i::text from public.attendance_imports i`));
  ok(!dump.match(/guest\.example|stranger|walkin/), "no non-member email/name is stored anywhere in attendance tables");
  const ai = (await su(`select * from public.attendance_imports where event_id=$1`, [E.past]))[0];
  ok(ai?.guests_registered === 3 && ai?.guests_checked_in === 2 && ai.rows_total === rows.length, "attendance_imports keeps only the counts");
  // re-import replaces
  await imp("admin", E.past, [{ email: "member2@tau.test", going: true, checked_in: false }], true);
  const after = await su(`select m.full_name, a.status from public.attendance a join public.members m on m.id=a.member_id where a.event_id=$1`, [E.past]);
  ok(after.length === 1 && after[0].full_name === "Member Two" && after[0].status === "no_show", "re-import REPLACES the event's attendance", JSON.stringify(after));
  await imp("admin", E.past, rows, true); // restore

  // --- validation
  ok(!!(await imp("admin", "00000000-0000-0000-0000-000000000000", rows, true)).error, "unknown event rejected");
  ok(!!(await run("admin", "select public.admin_import_attendance($1, '{\"a\":1}'::jsonb, true)", [E.past])).error, "non-array rows rejected");
  ok(!!(await imp("admin", E.past, Array.from({ length: 5001 }, (_, i) => ({ email: `x${i}@y.zz`, going: true })), true)).error, "more than 5000 rows rejected");
  ok(!!(await imp("admin", E.past, [{ email: "member2@tau.test", going: true, checked_in_at: "not-a-date" }], true)).error, "garbage timestamp rejected");
  ok((await su(`select count(*)::int c from public.attendance where event_id=$1`, [E.past]))[0].c === 2, "failed imports left the previous data intact (atomic)");

  // --- reads (RLS)
  for (const t of ["attendance", "attendance_imports"]) {
    ok(denied(await run("anon", `select * from public.${t}`)), `[anon] ${t}: permission denied`);
    for (const who of ["outsider", "unverified"]) ok(rowsOf(await run(who, `select * from public.${t}`)).length === 0, `[${who}] ${t}: zero rows`);
  }
  const mine = rowsOf(await run("member", "select member_id from public.attendance"));
  ok(mine.length === 1 && mine[0].member_id === M.member, "member reads ONLY their own attendance rows", JSON.stringify(mine));
  ok(rowsOf(await run("member2", "select * from public.attendance")).length === 0 || true, "(info) member2 has no checked-in/registered rows from the last import");
  ok(rowsOf(await run("member", "select * from public.attendance_imports")).length === 0, "member cannot read import metadata/guest counts");
  ok(rowsOf(await run("admin", "select * from public.attendance")).length === 2, "admin reads all attendance");
  ok(rowsOf(await run("admin", "select * from public.attendance_imports")).length >= 1, "admin reads import metadata");
  // --- no direct writes, for anyone
  for (const who of ["anon", "outsider", "member", "admin"]) {
    for (const sql of [
      `insert into public.attendance (event_id, member_id, status) values ('${E.future}', '${M.member}', 'checked_in')`,
      `update public.attendance set status='checked_in'`,
      `delete from public.attendance`,
      `insert into public.attendance_imports (event_id, rows_total, guests_registered, guests_checked_in) values ('${E.future}',0,0,0)`,
      `update public.attendance_imports set guests_registered = 999`,
      `delete from public.attendance_imports`,
    ]) {
      const r = await run(who, sql);
      ok(!!r.error, `[${who}] direct write refused: ${sql.slice(0, 48)}`);
    }
  }
  ok((await su(`select count(*)::int c from public.attendance where event_id=$1`, [E.past]))[0].c === 2, "attendance untouched by all direct-write attempts");
  // checks
  const bad = await db.query(`insert into public.attendance (event_id, member_id, status, checked_in_at) values ($1,$2,'registered', now())`, [E.future, M.member]).then(() => "ok", (e) => e.message);
  ok(/violates check constraint/.test(bad), "check_in time only allowed with status checked_in", bad);
  // cascade: deleting a member removes their attendance
  await su(`delete from public.members where id=$1`, [M.caseUser]);
  ok(true, "(info) member delete cascades without error");
}

console.log(`\n${n - fails}/${n} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
