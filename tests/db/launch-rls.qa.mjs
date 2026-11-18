// QA's independent members-launch tests: member_contacts + sharing toggles, the profile program field, the before_user_created hook,
// and a function-privilege audit. Same harness as m3-rls.qa.mjs.  node tests/db/launch-rls.qa.mjs
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
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role supabase_auth_admin nologin;
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
const U = {
  alice: await uid("alice@tau.test"), bob: await uid("bob@tau.test"), carl: await uid("carl@tau.test"),
  admin: await uid("admin@tau.test"), outsider: await uid("outsider@tau.test"), unverified: await uid("alice@tau.test", false),
  secondary: await uid("alice.alt@gmail.com"), upper: await uid("BOB@TAU.TEST"),
};
const M = {
  alice: await addMember("Alice", "member", ["alice@tau.test", "alice.alt@gmail.com"]),
  bob: await addMember("Bob", "member", ["bob@tau.test"]),
  carl: await addMember("Carl", "member", ["carl@tau.test"]),
  admin: await addMember("Admin", "admin", ["admin@tau.test"]),
};
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
const denied = (r) => !!r.error && /permission denied|row-level security|admins only|must be owner|members only/i.test(r.error);
const rowsOf = (r) => r.rows ?? [];
const su = async (sql, params = []) => (await db.query(sql, params)).rows;

const callAs = (who, sql, p) => (who === "anon" ? as("anon", null, sql, p) : as("authenticated", who, sql, p));

section("L1. member_contacts is closed to every API role (table-level)");
for (const who of ["anon", "outsider", "alice", "admin"]) {
  for (const [label, sql] of [
    ["select", "select * from public.member_contacts"],
    ["insert", `insert into public.member_contacts (member_id, phone) values ('${M.alice}', '0501234567')`],
    ["update", "update public.member_contacts set share_phone = true"],
    ["delete", "delete from public.member_contacts"],
    ["truncate", "truncate public.member_contacts"],
  ]) {
    const r = await callAs(who, sql);
    ok(denied(r), `[${who}] ${label} on member_contacts is denied`, JSON.stringify(r).slice(0, 160));
  }
}
{
  const g = (await su(`select has_table_privilege('anon','public.member_contacts','select') a, has_table_privilege('authenticated','public.member_contacts','select') b`))[0];
  ok(!g.a && !g.b, "no SELECT grant for anon/authenticated (catalog)");
}
ok((await su(`select relrowsecurity from pg_class where oid='public.member_contacts'::regclass`))[0].relrowsecurity, "RLS enabled on member_contacts");

section("L2. my_contact / update_my_contact");
ok(denied(await callAs("anon", "select * from public.my_contact()")), "[anon] my_contact denied");
ok(rowsOf(await callAs("outsider", "select * from public.my_contact()")).length === 0, "[outsider] my_contact: no rows");
ok(denied(await callAs("outsider", "select public.update_my_contact('0501234567',null,true,true)")), "[outsider] update_my_contact denied");
ok(denied(await callAs("unverified", "select public.update_my_contact('0501234567',null,true,true)")), "[unverified twin of alice's email] cannot write alice's row");
const mine0 = rowsOf(await callAs("alice", "select * from public.my_contact()"));
ok(mine0.length === 1 && mine0[0].share_phone === false && mine0[0].share_email === false && mine0[0].phone === null, "[alice] fresh my_contact: one empty row, both toggles OFF", JSON.stringify(mine0));
ok(!(await callAs("alice", "select public.update_my_contact(' +972 50-123-4567 ',' Alice.Contact@Example.COM ',false,false)")).error, "[alice] saves phone + email, toggles off");
const mine1 = rowsOf(await callAs("alice", "select * from public.my_contact()"))[0];
ok(mine1.phone === "+972 50-123-4567" && mine1.contact_email === "alice.contact@example.com", "values trimmed and email lowercased", JSON.stringify(mine1));
ok(rowsOf(await callAs("alice", "select * from public.member_contact($1)", [M.alice]))[0]?.phone === "+972 50-123-4567", "[alice] sees her own details through member_contact(self) with sharing off");
for (const bad of ["abc", "<script>alert(1)</script>", "050'; drop table x;--", "1", "0".repeat(40), "+", "05012345\n67"]) {
  const r = await callAs("alice", "select public.update_my_contact($1,null,false,false)", [bad]);
  ok(!!r.error, `[alice] phone ${JSON.stringify(bad).slice(0, 30)} is rejected`, JSON.stringify(rowsOf(r)));
}
for (const bad of ["no-at-sign", "a@b", "a b@c.com", "x@y.z\n", `${"a".repeat(250)}@x.com`]) {
  const r = await callAs("alice", "select public.update_my_contact(null,$1,false,false)", [bad]);
  ok(!!r.error, `[alice] contact email ${JSON.stringify(bad).slice(0, 30)} is rejected`, JSON.stringify(rowsOf(r)));
}
ok(rowsOf(await callAs("alice", "select * from public.my_contact()"))[0].phone === "+972 50-123-4567", "rejected saves left the stored values untouched");
await callAs("alice", "select public.update_my_contact('+972501234567','alice.contact@example.com',false,false)");

section("L3. what other members see: only what is toggled on");
const seeA = async (who) => rowsOf(await callAs(who, "select * from public.member_contact($1)", [M.alice]))[0];
let r0 = await seeA("bob");
ok(r0 && r0.phone === null && r0.contact_email === null, "[bob] both OFF: a row with two NULLs, no values", JSON.stringify(r0));
await callAs("alice", "select public.update_my_contact('+972501234567','alice.contact@example.com',true,false)");
r0 = await seeA("bob");
ok(r0.phone === "+972501234567" && r0.contact_email === null, "[bob] phone only when only share_phone is on", JSON.stringify(r0));
await callAs("alice", "select public.update_my_contact('+972501234567','alice.contact@example.com',false,true)");
r0 = await seeA("bob");
ok(r0.phone === null && r0.contact_email === "alice.contact@example.com", "[bob] email only when only share_email is on", JSON.stringify(r0));
await callAs("alice", "select public.update_my_contact('+972501234567','alice.contact@example.com',true,true)");
for (const who of ["anon", "outsider", "unverified"]) {
  const r = await callAs(who, "select * from public.member_contact($1)", [M.alice]);
  ok(who === "anon" ? denied(r) : rowsOf(r).length === 0, `[${who}] sees nothing even with both toggles on`, JSON.stringify(r).slice(0, 160));
}
ok(rowsOf(await callAs("secondary", "select * from public.member_contact($1)", [M.alice])).length === 1, "[session on alice's SECONDARY email] resolves to a member");
ok(rowsOf(await callAs("upper", "select * from public.member_contact($1)", [M.alice])).length === 1, "[BOB@TAU.TEST case variant] resolves to a member (citext)");
ok((await seeA("admin"))?.phone === "+972501234567", "[admin] sees shared fields like any member");
await callAs("alice", "select public.update_my_contact('+972501234567','alice.contact@example.com',false,false)");
const adminView = await seeA("admin");
ok(adminView && adminView.phone === null && adminView.contact_email === null, "[admin] sees NOTHING private of an unshared member through the RPC", JSON.stringify(adminView));
ok(rowsOf(await callAs("bob", "select * from public.member_contact('00000000-0000-4000-8000-000000000000')")).length === 0, "[bob] unknown member id: no rows");
ok(rowsOf(await callAs("bob", "select * from public.member_contact(null)")).length === 0, "[bob] null id: no rows");
await callAs("bob", "select public.update_my_contact('0509999999',null,true,true)");
ok(rowsOf(await callAs("alice", "select * from public.member_contact($1)", [M.bob]))[0]?.phone === "0509999999", "[alice] sees bob's shared phone");
ok(rowsOf(await callAs("alice", "select * from public.my_contact()"))[0].phone === "+972501234567", "bob's save did not touch alice's row");
ok((await su("select count(*)::int c from public.member_contacts"))[0].c === 2, "exactly two rows exist (one per saving member)");

section("L4. contact data appears nowhere else a member can read");
await callAs("alice", "select public.update_my_contact('+972501234567','alice.contact@example.com',true,true)");
for (const [label, sql, p] of [
  ["profiles", "select to_jsonb(p)::text t from public.profiles p", []],
  ["member_directory()", "select to_jsonb(d)::text t from public.member_directory() d", []],
  ["member_profile(alice)", "select to_jsonb(d)::text t from public.member_profile($1) d", [M.alice]],
  ["members", "select to_jsonb(m)::text t from public.members m", []],
  ["current_member()", "select to_jsonb(m)::text t from public.current_member() m", []],
  ["events", "select to_jsonb(e)::text t from public.events e", []],
]) {
  const r = await callAs("bob", sql, p);
  const blob = JSON.stringify(rowsOf(r));
  ok(!r.error && !/501234567|alice\.contact@example\.com/.test(blob), `[bob] ${label}: no phone / contact email`, (r.error ?? "") + blob.slice(0, 160));
}

section("L5. program field");
for (const w of ["alice", "bob"]) await callAs(w, "select * from public.claim_membership()"); // creates the profile rows
ok((await callAs("alice", "update public.profiles set program = 'CS, year 3' where member_id = $1", [M.alice])).count === 1, "[alice] sets own program (1 row)");
ok(((await callAs("alice", "update public.profiles set program = 'hax' where member_id = $1", [M.bob])).count ?? 0) === 0, "[alice] cannot set bob's program");
ok(!!(await callAs("alice", `update public.profiles set program = '${"x".repeat(161)}' where member_id = $1`, [M.alice])).error, "program over 160 chars rejected");
ok(rowsOf(await callAs("bob", "select program from public.member_profile($1)", [M.alice]))[0]?.program === "CS, year 3", "[bob] sees alice's program through member_profile");
ok(rowsOf(await callAs("outsider", "select * from public.member_profile($1)", [M.alice])).length === 0, "[outsider] member_profile empty");
ok(denied(await callAs("anon", "select * from public.member_profile($1)", [M.alice])), "[anon] member_profile denied");

section("L6. before_user_created hook");
const hook = async (ev, role = "supabase_auth_admin") => {
  await db.exec(`set role ${role}`);
  try { return (await db.query("select public.hook_before_user_created($1::jsonb) h", [JSON.stringify(ev)])).rows[0].h; }
  catch (e) { return { threw: e.message }; } finally { await db.exec("reset role"); }
};
const allowed = (h) => !!h && !h.threw && !h.error && Object.keys(h).length === 0;
const rejected = (h) => !!h && !h.threw && !!h.error && h.error.http_code === 403;
ok(allowed(await hook({ user: { email: "alice@tau.test" } })), "allows a listed email");
ok(allowed(await hook({ user: { email: "ALICE.ALT@Gmail.com" } })), "allows a listed SECONDARY email, any case");
ok(allowed(await hook({ user: { email: "  bob@tau.test  " } })), "allows with surrounding spaces");
for (const e of ["stranger@tau.test", "alice@tau.test.evil.com", "xalice@tau.test", "alice@tau.tes", "%@tau.test", "alice@tau.test' or '1'='1", "", null, "a@b@tau.test"]) {
  const h = await hook({ user: { email: e } });
  ok(rejected(h), `rejects ${JSON.stringify(e)}`, JSON.stringify(h));
}
ok(rejected(await hook({})), "rejects an event with no user");
ok(rejected(await hook({ user: {} })), "rejects a user with no email (phone / anonymous sign-up)");
{
  const h = await hook({ user: { email: ["alice@tau.test"] } });
  ok(!allowed(h), "an array-typed email does not pass", JSON.stringify(h));
}
for (const role of ["anon", "authenticated"]) {
  const h = await hook({ user: { email: "alice@tau.test" } }, role);
  ok(!!h?.threw && /permission denied/.test(h.threw), `[${role}] cannot call the hook`, JSON.stringify(h));
}
console.log("INFO  service_role keeps EXECUTE on the hook (Supabase default privileges); it is a server-only key that can read member_emails anyway");
const tmpMember = await addMember("Removed", "member", ["removed@tau.test"]);
ok(allowed(await hook({ user: { email: "removed@tau.test" } })), "listed before removal: allowed");
await su("delete from public.members where id = $1", [tmpMember]);
ok(rejected(await hook({ user: { email: "removed@tau.test" } })), "after the member row is deleted: rejected");
const hp = (await su(`select prosecdef, proconfig from pg_proc where oid='public.hook_before_user_created(jsonb)'::regprocedure`))[0];
ok(hp.prosecdef && /search_path=/.test(String(hp.proconfig)), "hook is SECURITY DEFINER with a pinned search_path");
const mig = readFileSync(join(root, "supabase", "migrations", "20261119000000_members_launch.sql"), "utf8");
ok(/grant\s+usage\s+on\s+schema\s+public\s+to\s+supabase_auth_admin/i.test(mig), "migration grants USAGE on schema public to supabase_auth_admin (Supabase's documented hook setup; without it the hook can fail with 'permission denied for schema public')", "missing in the migration; scripts/check-db.mjs grants it in its own stub, which hides the gap");

section("L7. function-privilege audit");
const fns = await su(`select p.oid::regprocedure::text sig, p.prosecdef sd, p.proconfig cfg,
  has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'`);
for (const f of ["my_contact", "update_my_contact", "member_contact", "hook_before_user_created", "member_profile"]) {
  const x = fns.find((r) => r.sig.startsWith(`${f}(`) || r.sig.startsWith(`public.${f}(`));
  ok(x && !x.a, `${f}: anon has no EXECUTE`, JSON.stringify(x));
}
ok(!fns.find((r) => r.sig.includes("hook_before_user_created")).u, "hook: authenticated has no EXECUTE");
const unsafe = fns.filter((r) => r.sd && !(r.cfg ?? []).some((c) => /^search_path=/.test(c)));
ok(unsafe.length === 0, "every SECURITY DEFINER function pins search_path", JSON.stringify(unsafe.map((r) => r.sig)));
console.log(`INFO  SECURITY DEFINER functions callable by anon: ${fns.filter((r) => r.sd && r.a).map((r) => r.sig).join(", ")}`);

console.log(`\n${n - fails}/${n} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
