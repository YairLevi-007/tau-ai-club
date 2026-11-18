// Milestone 2 RLS checks, run by scripts/check-db.mjs after migrations + seed.
//
// Every check runs as a real API role (anon / authenticated) with Supabase-style JWT
// claims in request.jwt.claims, exactly what PostgREST does for each request.
//
// Personas:
//   guest       anon role, no JWT
//   outsider    signed in with a verified Google email that is NOT on the allowlist
//   unverified  allowlisted email, but auth.users.email_confirmed_at is null
//   spoofed     JWT claims an allowlisted email that isn't the account's real email
//   member      allowlisted (allowlist entry is Mixed-Case, JWT is lower-case)
//   member2     allowlisted only through a SECONDARY email
//   admin       allowlisted with role admin

const SECRET = {
  email: "speaker.private@example.test",
  phone: "+972 50 123 4567",
  linkedin: "https://www.linkedin.com/in/public-speaker",
  linkedinPrivate: "https://www.linkedin.com/in/members-only-speaker",
};

const USERS = {
  admin: { id: "00000000-0000-4000-8000-00000000000a", email: "admin@club.test", confirmed: true },
  member: { id: "00000000-0000-4000-8000-00000000000b", email: "member@club.test", confirmed: true },
  member2: { id: "00000000-0000-4000-8000-00000000000c", email: "alt.member2@gmail.test", confirmed: true },
  outsider: { id: "00000000-0000-4000-8000-00000000000d", email: "outsider@gmail.test", confirmed: true },
  unverified: { id: "00000000-0000-4000-8000-00000000000e", email: "unverified@club.test", confirmed: false },
  // Real account email is attacker@gmail.test, but the JWT claims member@club.test.
  spoofed: { id: "00000000-0000-4000-8000-00000000000f", email: "attacker@gmail.test", jwtEmail: "member@club.test", confirmed: true },
};

export async function runM2Checks(db, check) {
  // ---- helpers -------------------------------------------------------------
  const claimsFor = (who) => {
    if (who === "guest") return "";
    const u = USERS[who];
    return JSON.stringify({ sub: u.id, email: u.jwtEmail ?? u.email, role: "authenticated", aud: "authenticated" });
  };
  /** Run `sql` as a persona. Returns { rows } or { error }. Never throws. */
  const as = async (who, sql, params = []) => {
    await db.query("select set_config('request.jwt.claims', $1, false)", [claimsFor(who)]);
    await db.exec(`set role ${who === "guest" ? "anon" : "authenticated"}`);
    try {
      const res = await db.query(sql, params);
      return { rows: res.rows, affected: res.affectedRows ?? 0 };
    } catch (e) {
      return { error: e.message };
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claims', '', false)");
    }
  };
  const denied = (r) => Boolean(r.error);
  const empty = (r) => !r.error && r.rows.length === 0;
  const one = async (who, sql, params) => {
    const r = await as(who, sql, params);
    return r.error ? undefined : r.rows[0];
  };
  const ALL = ["guest", "outsider", "unverified", "spoofed", "member", "member2", "admin"];
  const NON_MEMBERS = ["guest", "outsider", "unverified", "spoofed"];
  const SIGNED_IN_NON_MEMBERS = ["outsider", "unverified", "spoofed"];

  // ---- fixtures (service role / superuser) -----------------------------------
  for (const u of Object.values(USERS)) {
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)", [
      u.id,
      u.email,
      u.confirmed ? new Date().toISOString() : null,
    ]);
  }
  await db.exec(`
    with a as (insert into public.members (full_name, role) values ('Ada Admin', 'admin') returning id)
      insert into public.member_emails (email, member_id, is_primary) select 'admin@club.test', id, true from a;
    with m as (insert into public.members (full_name) values ('יונתן חבר') returning id)
      insert into public.member_emails (email, member_id, is_primary) select 'Member@Club.TEST', id, true from m;
    with m as (insert into public.members (full_name) values ('Second Member') returning id)
      insert into public.member_emails (email, member_id, is_primary)
        select 'primary.member2@tau.test', id, true from m
        union all select 'alt.member2@gmail.test', id, false from m;
    with m as (insert into public.members (full_name) values ('Unverified Person') returning id)
      insert into public.member_emails (email, member_id, is_primary) select 'unverified@club.test', id, true from m;

    -- Contact rows, written as the service role.
    --  shay-yahal (public speaker): email + phone + LinkedIn shared, LinkedIn public.
    --  oz (public speaker): only LinkedIn shared with members, NOT public. No email/phone.
    --  secret-speaker (only on a draft event): LinkedIn shared + "public", must still not leak.
    insert into public.speaker_contacts (speaker_id, email, phone, linkedin_url, share_email, share_phone, share_linkedin, linkedin_public, consented_at)
      select id, '${SECRET.email}', '${SECRET.phone}', '${SECRET.linkedin}', true, true, true, true, now()
      from public.speakers where slug = 'shay-yahal';
    insert into public.speaker_contacts (speaker_id, linkedin_url, share_linkedin, linkedin_public, consented_at)
      select id, '${SECRET.linkedinPrivate}', true, false, now() from public.speakers where slug = 'oz-altagar';
    insert into public.speaker_contacts (speaker_id, linkedin_url, share_linkedin, linkedin_public, consented_at)
      select id, 'https://www.linkedin.com/in/secret', true, true, now() from public.speakers where slug = 'secret-speaker';
  `);
  const speakerId = async (slug) => (await db.query("select id from public.speakers where slug = $1", [slug])).rows[0].id;
  const shai = await speakerId("shay-yahal");
  const oz = await speakerId("oz-altagar");
  const secret = await speakerId("secret-speaker");
  const roee = await speakerId("roee-margalit");

  // ---- 1. identity helpers ---------------------------------------------------
  const helper = (who) => one(who, "select public.is_member() as m, public.is_admin() as a");
  for (const who of NON_MEMBERS) {
    const r = await helper(who);
    check(r && r.m === false && r.a === false, `[${who}] is_member() = false, is_admin() = false`);
  }
  for (const who of ["member", "member2"]) {
    const r = await helper(who);
    check(r && r.m === true && r.a === false, `[${who}] is_member() = true, is_admin() = false`);
  }
  {
    const r = await helper("admin");
    check(r && r.m === true && r.a === true, "[admin] is_member() = true, is_admin() = true");
  }
  check(
    (await helper("member")).m === true,
    "allowlist match is case-insensitive (Member@Club.TEST on the list, member@club.test in the JWT)",
  );
  check((await helper("member2")).m === true, "a secondary email on the allowlist grants membership");
  check((await helper("unverified")).m === false, "an unverified email never matches the allowlist");
  check((await helper("spoofed")).m === false, "a JWT email that differs from the account's real email never matches");

  // ---- 2. allowlist tables ---------------------------------------------------
  for (const t of ["members", "member_emails"]) {
    check(denied(await as("guest", `select * from public.${t}`)), `[guest] cannot read ${t}`);
    for (const who of [...SIGNED_IN_NON_MEMBERS, "member", "member2"]) {
      check(empty(await as(who, `select * from public.${t}`)), `[${who}] reads 0 rows from ${t}`);
    }
  }
  {
    const r = await as("admin", "select count(*)::int as n from public.member_emails");
    check(r.rows?.[0]?.n === 5, `[admin] reads the whole allowlist (got ${r.rows?.[0]?.n})`);
  }
  {
    const r = await one("member", "select full_name, role from public.current_member()");
    check(r?.full_name === "יונתן חבר" && r?.role === "member", "[member] current_member() returns only their own row");
    check(empty(await as("outsider", "select * from public.current_member()")), "[outsider] current_member() is empty");
  }

  // ---- 3. first login / profiles --------------------------------------------
  {
    const first = await one("member", "select * from public.claim_membership()");
    const again = await one("member", "select * from public.claim_membership()");
    check(first?.first_login === true && again?.first_login === false, "claim_membership(): first login once, then not");
    check(first?.full_name === "יונתן חבר", "claim_membership() returns the member's name for the welcome");
    check(empty(await as("outsider", "select * from public.claim_membership()")), "[outsider] claim_membership() creates nothing");
    check(denied(await as("guest", "select * from public.claim_membership()")), "[guest] cannot call claim_membership()");
    await as("member2", "select * from public.claim_membership()");
    await as("admin", "select * from public.claim_membership()");
    const n = (await db.query("select count(*)::int as n from public.profiles")).rows[0].n;
    check(n === 3, `only members got a profile row (got ${n})`);
  }
  check(denied(await as("guest", "select * from public.profiles")), "[guest] cannot read profiles");
  for (const who of SIGNED_IN_NON_MEMBERS) {
    check(empty(await as(who, "select * from public.profiles")), `[${who}] reads 0 profiles`);
  }
  check((await as("member", "select * from public.profiles")).rows?.length === 3, "[member] reads all profiles");
  {
    const own = await as("member", "update public.profiles set bio_en = 'hi' where member_id = public.current_member_id()");
    check(!own.error && own.affected === 1, "[member] can edit their own profile");
    const other = await as("member", "update public.profiles set bio_en = 'x' where member_id <> public.current_member_id()");
    check(!other.error && other.affected === 0, "[member] cannot edit another member's profile (0 rows)");
    check(
      denied(await as("member", "update public.profiles set member_id = gen_random_uuid()")),
      "[member] cannot change profile member_id",
    );
    check(
      denied(await as("member", "update public.profiles set welcomed_at = null")),
      "[member] cannot reset welcomed_at",
    );
    check(
      denied(await as("member", "insert into public.profiles (member_id) values (gen_random_uuid())")),
      "[member] cannot insert profiles directly",
    );
  }

  // ---- 4. no self-promotion, no allowlist writes by non-admins --------------
  for (const who of ["guest", "outsider", "member"]) {
    const up = await as(who, "update public.members set role = 'admin'");
    check(denied(up) || up.affected === 0, `[${who}] cannot promote anyone to admin`);
    const ins = await as(who, "insert into public.member_emails (email, member_id) select 'me@evil.test', id from public.members limit 1");
    check(denied(ins) || ins.affected === 0, `[${who}] cannot add an email to the allowlist`);
    check(
      denied(await as(who, "select public.admin_add_member('x@evil.test', 'Evil', 'admin')")),
      `[${who}] cannot call admin_add_member()`,
    );
    check(
      denied(await as(who, `select * from public.admin_import_members('[{"email":"x@evil.test","full_name":"E","role":"admin"}]')`)),
      `[${who}] cannot call admin_import_members()`,
    );
  }
  check((await helper("member")).a === false, "[member] is still not admin after the attempts");

  // ---- 5. content writes -----------------------------------------------------
  const contentWrites = [
    ["insert event", "insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at) select 'm2-x', id, 'x', 'x', now(), now() + interval '1 hour' from public.cohorts"],
    ["update event", "update public.events set title_en = 'hacked' where slug = 'zero-to-hero-1'"],
    ["insert speaker", "insert into public.speakers (slug, name_he, name_en) values ('m2-x', 'x', 'x')"],
    ["delete line-up", "delete from public.event_speakers"],
    ["update venue", "update public.venues set name_en = 'hacked'"],
  ];
  for (const who of ["guest", "outsider", "member"]) {
    for (const [label, sql] of contentWrites) {
      const r = await as(who, sql);
      check(denied(r) || r.affected === 0, `[${who}] cannot ${label}`);
    }
  }
  check(
    (await db.query("select count(*)::int as n from public.events where title_en = 'hacked'")).rows[0].n === 0,
    "no event was changed by a non-admin",
  );
  {
    const drafts = await as("admin", "select slug from public.events where status = 'draft'");
    check(drafts.rows?.some((r) => r.slug === "draft-event"), "[admin] sees draft events");
    const member = await as("member", "select slug from public.events where status = 'draft'");
    check(empty(member), "[member] does not see draft events");
    const ins = await as(
      "admin",
      "insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at) select 'm2-admin-draft', id, 'x', 'x', now(), now() + interval '1 hour' from public.cohorts where slug = '02'",
    );
    check(!ins.error && ins.affected === 1, "[admin] can create an event");
    const up = await as("admin", "update public.events set status = 'published' where slug = 'm2-admin-draft'");
    check(!up.error && up.affected === 1, "[admin] can publish an event");
    await db.exec("delete from public.events where slug = 'm2-admin-draft'");
  }

  // ---- 6. speaker_contacts: no direct access for anyone ----------------------
  for (const who of ALL) {
    for (const t of ["speaker_contacts", "speaker_form_tokens"]) {
      check(denied(await as(who, `select * from public.${t}`)), `[${who}] cannot select from ${t}`);
    }
    // Filter-as-oracle and count tricks hit the same wall.
    check(
      denied(await as(who, `select count(*) from public.speaker_contacts where email = '${SECRET.email}'`)),
      `[${who}] cannot probe speaker_contacts with a filter`,
    );
    check(
      denied(await as(who, "delete from public.speaker_contacts")),
      `[${who}] cannot delete from speaker_contacts directly`,
    );
  }
  {
    const r = await db.query(`
      select grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name in ('speaker_contacts', 'speaker_form_tokens')
        and grantee in ('anon', 'authenticated', 'PUBLIC')`);
    check(r.rows.length === 0, `no anon/authenticated grants on speaker_contacts / speaker_form_tokens (got ${r.rows.length})`);
  }

  // ---- 7. member_speaker_contact(): members only, consented fields only -----
  check(denied(await as("guest", "select * from public.member_speaker_contact($1)", [shai])), "[guest] cannot call member_speaker_contact()");
  for (const who of SIGNED_IN_NON_MEMBERS) {
    check(empty(await as(who, "select * from public.member_speaker_contact($1)", [shai])), `[${who}] member_speaker_contact() returns nothing`);
  }
  for (const who of ["member", "member2", "admin"]) {
    const s = await one(who, "select * from public.member_speaker_contact($1)", [shai]);
    check(
      s?.email === SECRET.email && s?.phone === SECRET.phone && s?.linkedin_url === SECRET.linkedin,
      `[${who}] sees the consented email, phone and LinkedIn`,
    );
    const o = await one(who, "select * from public.member_speaker_contact($1)", [oz]);
    check(
      o && o.email === null && o.phone === null && o.linkedin_url === SECRET.linkedinPrivate,
      `[${who}] sees only the consented field (LinkedIn) for a partial-consent speaker`,
    );
    check(empty(await as(who, "select * from public.member_speaker_contact($1)", [roee])), `[${who}] gets nothing for a speaker with no contact row`);
  }
  {
    // Consent off → hidden from members too, even if a value were somehow stored.
    let blocked = false;
    try {
      await db.exec(`update public.speaker_contacts set share_phone = false where speaker_id = '${shai}'`);
    } catch {
      blocked = true;
    }
    check(blocked, "the table refuses a stored phone without phone consent (check constraint)");
  }

  // ---- 8. public_speaker_links(): LinkedIn only, only when opted in ---------
  for (const who of ALL) {
    const s = await as(who, "select * from public.public_speaker_links($1)", [shai]);
    check(
      s.rows?.length === 1 && s.rows[0].linkedin_url === SECRET.linkedin && Object.keys(s.rows[0]).length === 1,
      `[${who}] public_speaker_links() returns only LinkedIn for an opted-in speaker`,
    );
    check(empty(await as(who, "select * from public.public_speaker_links($1)", [oz])), `[${who}] public_speaker_links() hides LinkedIn that isn't public`);
    check(empty(await as(who, "select * from public.public_speaker_links($1)", [secret])), `[${who}] public_speaker_links() hides speakers that are only on drafts`);
  }
  {
    // Opt-out takes effect immediately.
    await db.exec(`update public.speaker_contacts set linkedin_public = false where speaker_id = '${shai}'`);
    check(empty(await as("guest", "select * from public.public_speaker_links($1)", [shai])), "LinkedIn opt-out removes it from the public RPC immediately");
    await db.exec(`update public.speaker_contacts set linkedin_public = true where speaker_id = '${shai}'`);
  }

  // ---- 9. speaker form tokens: admin-only, single-use, expiring -------------
  for (const who of ["guest", "outsider", "member"]) {
    check(
      denied(await as(who, "select * from public.admin_create_speaker_token($1, 14)", [roee])),
      `[${who}] cannot create a speaker link`,
    );
    check(denied(await as(who, "select public.admin_delete_speaker_contact($1)", [shai])), `[${who}] cannot delete contact data`);
    check(denied(await as(who, "select * from public.admin_speaker_contact_status()")), `[${who}] cannot read the admin contact overview`);
  }
  const mint = async (speaker) => (await one("admin", "select token from public.admin_create_speaker_token($1, 14)", [speaker]))?.token;
  const submit = (who, token, o = {}) =>
    as(who, "select public.submit_speaker_contact($1, $2, $3, $4, $5, $6, $7, $8, $9)", [
      token,
      o.consent ?? true,
      o.shareEmail ?? true,
      o.email ?? "roee@example.test",
      o.sharePhone ?? false,
      o.phone ?? "+972 52 000 0000",
      o.shareLinkedin ?? true,
      o.linkedin ?? "https://www.linkedin.com/in/roee",
      o.linkedinPublic ?? false,
    ]);

  const token = await mint(roee);
  check(typeof token === "string" && /^[0-9a-f]{64}$/.test(token), "[admin] creates a 64-hex single-use token");
  {
    const stored = await db.query("select encode(token_hash, 'hex') as h from public.speaker_form_tokens where speaker_id = $1", [roee]);
    check(stored.rows.every((r) => r.h !== token), "only the token's hash is stored, never the raw token");
  }
  check((await one("guest", "select * from public.speaker_form_info($1)", [token]))?.name_en === "Ro'ee Margalit", "[guest] speaker_form_info() works with a valid token");
  check(empty(await as("guest", "select * from public.speaker_form_info($1)", ["0".repeat(64)])), "speaker_form_info() returns nothing for a wrong token");
  check(denied(await submit("guest", token, { consent: false })), "submit without explicit consent is rejected");
  check(denied(await submit("guest", token, { shareEmail: true, email: "" })), "submit with a shared-but-empty field is rejected");
  check(denied(await submit("guest", token, { linkedin: "https://evil.test/x" })), "submit with a non-LinkedIn URL is rejected");
  check(denied(await submit("guest", "0".repeat(64))), "submit with a wrong token is rejected");
  check(!(await submit("guest", token)).error, "[guest] submits the form with a valid token and consent");
  {
    const row = (await db.query("select * from public.speaker_contacts where speaker_id = $1", [roee])).rows[0];
    check(
      row && row.email === "roee@example.test" && row.phone === null && row.share_phone === false && row.consented_at,
      "only consented fields are stored (phone was typed but not consented → not stored), consented_at set",
    );
    check(row && row.linkedin_public === false, "LinkedIn is not public unless the speaker opted in");
  }
  check(denied(await submit("guest", token, { email: "again@example.test" })), "a used token cannot be submitted twice");
  check(empty(await as("guest", "select * from public.speaker_form_info($1)", [token])), "speaker_form_info() returns nothing for a used token");
  {
    const t1 = await mint(roee);
    const t2 = await mint(roee);
    check(denied(await submit("guest", t1)), "creating a new link invalidates the previous unused link");
    await db.query(
      "update public.speaker_form_tokens set created_at = now() - interval '20 days', expires_at = now() - interval '1 second' where token_hash = sha256(convert_to($1, 'UTF8'))",
      [t2],
    );
    check(empty(await as("guest", "select * from public.speaker_form_info($1)", [t2])), "speaker_form_info() returns nothing for an expired token");
    check(denied(await submit("guest", t2)), "an expired token is rejected");
    const t3 = await mint(roee);
    await as("admin", "select public.admin_revoke_speaker_tokens($1)", [roee]);
    check(denied(await submit("guest", t3)), "a revoked token is rejected");
  }
  {
    const t = await mint(roee);
    const r = await submit("outsider", t, { linkedinPublic: true, shareEmail: false });
    check(!r.error, "a signed-in non-member can also use a valid link (the link is the credential)");
    const pub = await as("guest", "select * from public.public_speaker_links($1)", [roee]);
    // roee is on a published event, opted in → public now.
    check(pub.rows?.[0]?.linkedin_url === "https://www.linkedin.com/in/roee", "resubmitting with public LinkedIn publishes only LinkedIn");
    const row = (await db.query("select email from public.speaker_contacts where speaker_id = $1", [roee])).rows[0];
    check(row.email === null, "resubmitting without email consent removes the stored email");
  }
  {
    const st = await as("admin", "select * from public.admin_speaker_contact_status()");
    const shaiRow = st.rows?.find((r) => r.slug === "shay-yahal");
    check(shaiRow?.has_email === true && !("email" in shaiRow), "[admin] overview reports which fields exist without the values");
    check(!(await as("admin", "select public.admin_delete_speaker_contact($1)", [shai])).error, "[admin] deletes a speaker's contact data");
    const gone = (await db.query("select count(*)::int as n from public.speaker_contacts where speaker_id = $1", [shai])).rows[0].n;
    check(gone === 0, "deleted contact data is gone (hard delete)");
    check(empty(await as("member", "select * from public.member_speaker_contact($1)", [shai])), "[member] sees nothing after deletion");
  }

  // ---- 10. admin allowlist management -----------------------------------------
  {
    const add = await as("admin", "select public.admin_add_member('New.Person@Gmail.test', 'New Person', 'member') as id");
    check(!add.error, "[admin] adds a member");
    check(
      denied(await as("admin", "select public.admin_add_member('new.person@gmail.test', 'Dup', 'member')")),
      "adding an email that is already on the list fails (case-insensitive)",
    );
    const imp = await one(
      "admin",
      "select * from public.admin_import_members($1::jsonb)",
      [JSON.stringify([
        { email: "csv.one@tau.test", full_name: "CSV One", role: "member" },
        { email: "NEW.PERSON@gmail.test", full_name: "New Person Renamed", role: "admin" },
      ])],
    );
    check(imp?.inserted === 1 && imp?.updated === 1, "CSV import upserts by email (1 new, 1 updated)");
    const bad = await as("admin", "select * from public.admin_import_members($1::jsonb)", [
      JSON.stringify([
        { email: "csv.two@tau.test", full_name: "CSV Two" },
        { email: "not-an-email", full_name: "Bad" },
      ]),
    ]);
    check(denied(bad) && /row 2/.test(bad.error), "a bad CSV row aborts the whole import and names the row");
    check(
      (await db.query("select count(*)::int as n from public.member_emails where email = 'csv.two@tau.test'")).rows[0].n === 0,
      "nothing from the aborted import was written",
    );
    const sec = await as(
      "admin",
      "insert into public.member_emails (email, member_id) select 'second@tau.test', member_id from public.member_emails where email = 'csv.one@tau.test'",
    );
    check(!sec.error && sec.affected === 1, "[admin] adds a secondary email");
    const role = await as("admin", "update public.members set role = 'member' where full_name = 'New Person Renamed'");
    check(!role.error && role.affected === 1, "[admin] changes a member's role");
  }
  {
    // Last-admin guard: the only admin can't be demoted or removed.
    const demote = await as("admin", "update public.members set role = 'member' where full_name = 'Ada Admin'");
    check(denied(demote), "the last admin cannot be demoted");
    const del = await as("admin", "delete from public.members where full_name = 'Ada Admin'");
    check(denied(del), "the last admin cannot be removed");
  }
  {
    // Removing a member revokes access on the very next request.
    check((await helper("member2")).m === true, "[member2] is a member before removal");
    const del = await as("admin", "delete from public.members where full_name = 'Second Member'");
    check(!del.error && del.affected === 1, "[admin] removes a member");
    check((await helper("member2")).m === false, "a removed member loses access immediately");
    check(empty(await as("member2", "select * from public.profiles")), "a removed member reads 0 profiles");
  }

  // ---- 11. schema hygiene ------------------------------------------------------
  {
    const noRls = await db.query(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity",
    );
    check(noRls.rows.length === 0, `RLS is enabled on every public table${noRls.rows.length ? ` (missing: ${noRls.rows.map((r) => r.tablename).join(", ")})` : ""}`);
    const anonFns = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    const allowed = ["current_member_id", "is_admin", "is_member", "public_speaker_links", "speaker_form_info", "submit_speaker_contact"];
    const extra = anonFns.rows.map((r) => r.proname).filter((n) => !allowed.includes(n) && n !== "set_updated_at");
    check(extra.length === 0, `anon can execute only the intended functions${extra.length ? ` (extra: ${extra.join(", ")})` : ""}`);
    const definer = await db.query(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not coalesce(p.proconfig @> array['search_path=""'], false)`);
    check(definer.rows.length === 0, `every security-definer function pins search_path${definer.rows.length ? ` (missing: ${definer.rows.map((r) => r.proname).join(", ")})` : ""}`);
  }
}
