// Milestone 2 checks for attendance (Luma CSV import). Run by scripts/check-db.mjs after
// scripts/rls-m2-profiles.mjs, whose personas (alice, bob: members; outsider: not on the
// allowlist; admin) it reuses.

const P = {
  admin: { id: "00000000-0000-4000-8000-00000000000a", email: "admin@club.test" },
  alice: { id: "00000000-0000-4000-8000-0000000000a1", email: "alice@club.test" },
  bob: { id: "00000000-0000-4000-8000-0000000000b2", email: "bob@club.test" },
  outsider: { id: "00000000-0000-4000-8000-00000000000d", email: "outsider@gmail.test" },
};

export async function runAttendanceChecks(db, check) {
  const as = async (who, sql, params = []) => {
    const claims = who === "guest" ? "" : JSON.stringify({ sub: P[who].id, email: P[who].email, role: "authenticated", aud: "authenticated" });
    await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
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

  // ---- fixtures: one past and one future event, alice with a second email ------
  const cohort = (await db.query("select id from public.cohorts where slug = '02'")).rows[0].id;
  const mkEvent = async (slug, startsSql) =>
    (
      await db.query(
        `insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at, status)
         values ($1, $2, 'מפגש', 'Meetup', ${startsSql}, ${startsSql} + interval '2 hours', 'published') returning id`,
        [slug, cohort],
      )
    ).rows[0].id;
  const past = await mkEvent("att-past", "now() - interval '3 days'");
  const future = await mkEvent("att-future", "now() + interval '3 days'");
  const member = async (email) => (await db.query("select member_id from public.member_emails where email = $1", [email])).rows[0].member_id;
  const alice = await member(P.alice.email);
  const bob = await member(P.bob.email);
  await db.query("insert into public.member_emails (email, member_id, is_primary) values ('alice.personal@gmail.test', $1, false)", [alice]);

  const rows = [
    { email: "ALICE.personal@gmail.test", going: true, checked_in: true, checked_in_at: "2026-11-11T16:05:00Z" }, // secondary email, other case
    { email: "alice@club.test", going: true, checked_in: false, checked_in_at: null }, // same member again
    { email: "bob@club.test", going: true, checked_in: false, checked_in_at: null }, // registered, never came
    { email: "stranger@example.test", going: true, checked_in: true, checked_in_at: "2026-11-11T16:10:00Z" },
    { email: "stranger@example.test", going: true, checked_in: false, checked_in_at: null }, // same guest twice
    { email: "walkin@example.test", going: true, checked_in: false, checked_in_at: null },
    { email: "declined@example.test", going: false, checked_in: false, checked_in_at: null },
    { email: "not-an-email", going: true, checked_in: true, checked_in_at: null },
  ];
  const run = (who, event, r, commit) =>
    as(who, "select public.admin_import_attendance($1, $2::jsonb, $3) as out", [event, JSON.stringify(r), commit]);

  // ---- 17. who may import ------------------------------------------------------
  check(denied(await run("alice", past, rows, true)), "[member] cannot import attendance");
  check(denied(await run("outsider", past, rows, true)), "[outsider] cannot import attendance");
  check(denied(await run("guest", past, rows, true)), "[guest] cannot import attendance");
  check(denied(await run("admin", "00000000-0000-4000-8000-000000000999", rows, false)), "import rejects an unknown event");
  check(denied(await run("admin", past, { email: "x" }, false)), "import rejects rows that aren't an array");

  // ---- 18. preview, then save --------------------------------------------------
  const count = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].n);
  const preview = (await run("admin", past, rows, false)).rows?.[0]?.out;
  check(Boolean(preview) && preview.committed === false, "[admin] previews an import");
  check(await count("select count(*) as n from public.attendance where event_id = $1", [past]) === 0, "a preview stores nothing");
  const byId = (out, id) => out?.members.find((m) => m.member_id === id);
  check(byId(preview, alice)?.status === "checked_in", "a member is matched by a secondary email, any case, and counted once");
  check(preview?.members.length === 2, "two members matched (alice once, bob)");
  check(byId(preview, bob)?.status === "no_show", "registered but not checked in, after the event, is a no-show");
  check(preview?.guests_registered === 2 && preview?.guests_checked_in === 1, "non-members are counted per email (2 registered, 1 checked in)");
  check(preview?.ignored === 2 && preview?.rows_total === 8, "declined rows and bad emails are ignored");

  const saved = (await run("admin", past, rows, true)).rows?.[0]?.out;
  check(saved?.committed === true, "[admin] saves an import");
  const stored = (await db.query("select member_id, status, checked_in_at, source, imported_by from public.attendance where event_id = $1 order by status", [past])).rows;
  check(stored.length === 2, "only members are stored (2 rows)");
  check(stored.every((r) => r.source === "luma_csv"), "rows are marked source = luma_csv");
  check(stored.find((r) => r.member_id === alice)?.checked_in_at?.toISOString() === "2026-11-11T16:05:00.000Z", "the check-in time is kept");
  const adminMember = await member(P.admin.email);
  check(stored.every((r) => r.imported_by === adminMember), "imported_by is the admin's member id");
  const imp = (await db.query("select * from public.attendance_imports where event_id = $1", [past])).rows[0];
  check(imp?.guests_registered === 2 && imp?.guests_checked_in === 1 && imp?.rows_total === 8, "the guest counts are stored as numbers only");
  const dump = JSON.stringify([
    ...(await db.query("select * from public.attendance")).rows,
    ...(await db.query("select * from public.attendance_imports")).rows,
  ]);
  check(!/stranger|walkin|declined|example\.test/.test(dump), "no non-member email is stored anywhere in attendance");

  // ---- 19. re-import replaces; future events are 'registered' ------------------
  await run("admin", past, [{ email: "bob@club.test", going: true, checked_in: true, checked_in_at: null }], true);
  const after = (await db.query("select member_id, status from public.attendance where event_id = $1", [past])).rows;
  check(after.length === 1 && after[0].member_id === bob && after[0].status === "checked_in", "re-importing an event replaces its rows");
  check((await db.query("select guests_registered as n from public.attendance_imports where event_id = $1", [past])).rows[0].n === 0, "re-importing replaces the guest counts");
  await run("admin", past, rows, true);
  const fut = (await run("admin", future, [{ email: "bob@club.test", going: true }], true)).rows?.[0]?.out;
  check(byId(fut, bob)?.status === "registered", "before the event ends, going-but-not-checked-in stays 'registered'");

  // ---- 19b. two uploads per session: before / after (DECISIONS 25.11) -------------
  const phases = async (id) => (await db.query("select before_imported_at, after_imported_at from public.attendance_imports where event_id = $1", [id])).rows[0];
  const pp = await phases(past);
  check(Boolean(pp?.after_imported_at) && !pp.before_imported_at, "an upload after the session ends is stamped 'after' only");
  const pf = await phases(future);
  check(Boolean(pf?.before_imported_at) && !pf.after_imported_at, "an upload before the session ends is stamped 'before' only");
  // The same session, before and then after it ends.
  const both = await mkEvent("att-both", "now() + interval '1 day'");
  await run("admin", both, [{ email: "bob@club.test", going: true }], true);
  const b1 = await phases(both);
  check(Boolean(b1?.before_imported_at) && !b1.after_imported_at, "before the session: the 'before' upload is recorded");
  await db.query("update public.events set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = $1", [both]);
  await run("admin", both, [{ email: "bob@club.test", going: true, checked_in: true }], true);
  const b2 = await phases(both);
  check(
    Boolean(b2?.after_imported_at) && b2.before_imported_at?.getTime() === b1.before_imported_at.getTime(),
    "after the session: the 'after' upload is recorded and the 'before' time is kept",
  );
  check(
    (await db.query("select status from public.attendance where event_id = $1", [both])).rows.every((r) => r.status === "checked_in"),
    "the after upload still replaces the session's attendance (logic unchanged)",
  );
  const forge = await as("admin", "update public.attendance_imports set before_imported_at = now() where event_id = $1", [both]);
  check(denied(forge) || forge.affected === 0, "even an admin cannot write the upload times directly");
  check(denied(await as("admin", "select public.attendance_imports_phase()")), "the trigger function cannot be called directly");
  await db.query("delete from public.events where id = $1", [both]);

  // ---- 19c. what each upload brought in, kept per phase (25.11) -------------------
  const counts = async (id) =>
    (
      await db.query(
        `select before_rows_total, before_members, before_guests,
                after_rows_total, after_members_checked_in, after_no_shows, after_guests_checked_in
         from public.attendance_imports where event_id = $1`,
        [id],
      )
    ).rows[0];
  const sess = await mkEvent("att-counts", "now() + interval '1 day'");
  await run("admin", sess, [
    { email: "alice@club.test", going: true },
    { email: "bob@club.test", going: true },
    { email: "g1@example.test", going: true },
    { email: "g2@example.test", going: true },
    { email: "declined@example.test", going: false },
  ], true);
  const c1 = await counts(sess);
  check(
    c1?.before_rows_total === 5 && c1.before_members === 2 && c1.before_guests === 2 && c1.after_rows_total === null,
    "the before upload stores its counts: 5 in the file, 2 members registered, 2 guests",
  );
  await db.query("update public.events set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = $1", [sess]);
  await run("admin", sess, [
    { email: "alice@club.test", going: true, checked_in: true },
    { email: "bob@club.test", going: true },
    { email: "g1@example.test", going: true, checked_in: true },
    { email: "g2@example.test", going: true },
  ], true);
  const c2 = await counts(sess);
  check(
    c2?.after_rows_total === 4 && c2.after_members_checked_in === 1 && c2.after_no_shows === 1 && c2.after_guests_checked_in === 1,
    "the after upload stores its counts: 4 in the file, 1 member in, 1 no-show, 1 guest in",
  );
  check(c2?.before_rows_total === 5 && c2.before_members === 2 && c2.before_guests === 2, "the before counts survive the after upload");
  const forgeCount = await as("admin", "update public.attendance_imports set before_members = 99 where event_id = $1", [sess]);
  check(denied(forgeCount) || forgeCount.affected === 0, "even an admin cannot write the counts directly");
  check(empty(await as("alice", "select before_members from public.attendance_imports")), "[member] cannot read the upload counts");
  await db.query("delete from public.events where id = $1", [sess]);

  // ---- 19d. Luma emails matched to the right member (25.11) ------------------------
  const key = async (e) => (await db.query("select public.email_match_key($1) as k", [e])).rows[0].k;
  check(await key("  Gal.Shani77@Gmail.com ") === "galshani77@gmail.com", "match key: case, spaces and Gmail dots");
  check(await key("galshani77+luma@googlemail.com") === "galshani77@gmail.com", "match key: Gmail +tag and googlemail.com");
  check(await key("inﬁnity73737@gmail.com") === "infinity73737@gmail.com", "match key: NFKC turns the PDF's 'ﬁ' ligature back into 'fi'");
  check(await key("a.b+c@club.test") === "a.b+c@club.test", "match key: dots and +tags stay on other domains");

  const lm = await mkEvent("att-luma", "now() + interval '1 day'");
  await db.query("insert into public.member_emails (email, member_id, is_primary) values ('bob.smith@gmail.com', $1, false)", [bob]);
  const lumaRows = [
    { email: "BobSmith+luma@googlemail.com", going: true }, // bob's Gmail, another spelling
    { email: "alice.private@example.test", going: true }, // alice, an address the site doesn't know
    { email: "guest.one@example.test", going: true },
  ];
  const l1 = (await run("admin", lm, lumaRows, false)).rows?.[0]?.out;
  check(byId(l1, bob)?.status === "registered", "a Gmail dot/+tag/googlemail variant of a member's email matches the member");
  check(
    JSON.stringify([...(l1?.unmatched ?? [])].sort()) === JSON.stringify(["alice.private@example.test", "guest.one@example.test"]),
    "the import lists the upload's unmatched emails back to the admin",
  );
  check(!byId(l1, alice) && l1?.guests_registered === 2, "an unknown address is still a guest (statuses and counts unchanged)");

  // Linking: admins only, and only for matching (never for sign-in).
  const link = (who, email, memberId) => as(who, "insert into public.member_luma_emails (email, member_id) values ($1, $2)", [email, memberId]);
  check(denied(await link("alice", "x1@example.test", alice)), "[member] cannot link a Luma email");
  check(denied(await link("outsider", "x2@example.test", alice)), "[outsider] cannot link a Luma email");
  check(denied(await link("guest", "x3@example.test", alice)), "[guest] cannot link a Luma email");
  check(!denied(await link("admin", "alice.private@example.test", alice)), "[admin] links a Luma email to a member");
  check(denied(await link("admin", "alice.private@example.test", bob)), "one Luma email belongs to one member only");
  check(denied(await link("admin", "not-an-email", alice)), "a linked Luma email must look like an email");
  const owner = async (who, e) => {
    const r = await as(who, "select public.admin_email_owner($1) as id", [e]);
    return r.error ? "denied" : r.rows[0].id;
  };
  check(await owner("admin", "B.o.b.Smith+z@googlemail.com") === bob, "admin link check: a Gmail variant of a member's sign-in email finds that member (by key)");
  check(await owner("admin", "ALICE.private@example.test") === alice, "admin link check: finds the member of a linked Luma email");
  check(await owner("admin", "nobody@example.test") === null, "admin link check: an unknown address has no owner");
  check(await owner("alice", "bob.smith@gmail.com") === "denied", "[member] cannot ask who owns an address");
  check(await owner("guest", "bob.smith@gmail.com") === "denied", "[guest] cannot ask who owns an address");
  const l2 = (await run("admin", lm, lumaRows, true)).rows?.[0]?.out;
  check(byId(l2, alice)?.status === "registered" && JSON.stringify(l2?.unmatched) === '["guest.one@example.test"]', "after linking, the next import matches that member");
  check(byId(l2, alice)?.self_added === false && byId(l2, bob)?.self_added === false, "a match through an admin link or a sign-in email is not marked self-added");
  check(
    (await db.query("select linked_by from public.member_luma_emails where email = 'alice.private@example.test'")).rows[0]?.linked_by === adminMember,
    "a link records which admin made it",
  );
  check(empty(await as("alice", "select * from public.member_luma_emails")), "[member] cannot read linked Luma emails");
  check(empty(await as("outsider", "select * from public.member_luma_emails")) || denied(await as("outsider", "select * from public.member_luma_emails")), "[outsider] cannot read linked Luma emails");
  const gl = await as("guest", "select * from public.member_luma_emails");
  check(denied(gl) || empty(gl), "[guest] cannot read linked Luma emails");
  check(
    (await db.query("select public.email_on_club_list('alice.private@example.test') as ok")).rows[0].ok === false,
    "a linked Luma email is not a sign-in email (not on the club list)",
  );
  const lumaDump = JSON.stringify([
    ...(await db.query("select * from public.attendance")).rows,
    ...(await db.query("select * from public.attendance_imports")).rows,
    ...(await db.query("select * from public.member_luma_emails")).rows,
  ]);
  check(!/guest\.one/.test(lumaDump), "an unmatched (non-member) email is still stored nowhere");
  // ---- 19e. a member adds their own Luma address (personal area) ------------------
  const addMine = async (who, email) => {
    const r = await as(who, "select public.add_my_luma_email($1) as out", [email]);
    return r.error ? `error:${r.error}` : r.rows[0].out;
  };
  const mine = async (who) => {
    const r = await as(who, "select email from public.my_luma_emails()");
    return r.error ? null : r.rows.map((x) => x.email);
  };
  check(await addMine("bob", " Bob.Luma@Example.test ") === "added", "[member] adds their own Luma email");
  check(JSON.stringify(await mine("bob")) === '["bob.luma@example.test"]', "[member] sees their own Luma emails (trimmed, lower case)");
  check(JSON.stringify(await mine("alice")) === '["alice.private@example.test"]', "[member] sees the one an admin linked for them, and only their own");
  check(await addMine("bob", "bob.luma@example.test") === "exists", "adding the same one again changes nothing");
  check(await addMine("bob", "Bob@Club.test") === "own", "their own sign-in email is not added (it matches anyway)");
  check(/taken/.test(await addMine("bob", "alice.private@example.test")), "another member's linked Luma email is refused");
  check(/taken/.test(await addMine("bob", "alice@club.test")), "another member's sign-in email is refused");
  check(/taken/.test(await addMine("alice", "b.o.b.s.m.i.t.h+x@googlemail.com")), "another member's email is refused by match key too (Gmail variant)");
  check(/invalid/.test(await addMine("bob", "not-an-email")), "a self-added Luma email must look like an email");
  check(/members only/.test(await addMine("outsider", "out@example.test")), "[outsider] cannot add a Luma email");
  check(denied(await as("guest", "select public.add_my_luma_email('g@example.test')")), "[guest] cannot add a Luma email");
  check(denied(await as("guest", "select * from public.my_luma_emails()")), "[guest] cannot list Luma emails");
  check(denied(await as("bob", "insert into public.member_luma_emails (email, member_id) values ('direct@example.test', $1)", [bob])), "[member] still cannot write the table directly");
  check(await addMine("bob", "b2@example.test") === "added" && await addMine("bob", "b3@example.test") === "added", "a member may add up to 3");
  check(/limit/.test(await addMine("bob", "b4@example.test")), "a 4th Luma email is refused");
  check(
    (await db.query("select linked_by from public.member_luma_emails where email = 'bob.luma@example.test'")).rows[0]?.linked_by === bob,
    "a self-added Luma email records the member as the one who linked it",
  );
  check(
    (await db.query("select public.email_on_club_list('bob.luma@example.test') as ok")).rows[0].ok === false,
    "a self-added Luma email is not a sign-in email (not on the club list)",
  );
  const self = (await run("admin", lm, [{ email: "BOB.LUMA@example.test", going: true }], false)).rows?.[0]?.out;
  check(byId(self, bob)?.status === "registered" && JSON.stringify(self?.unmatched) === "[]", "an upload then matches the member by their self-added email");
  check(byId(self, bob)?.self_added === true, "the preview marks a match that came through a self-added address (F3)");
  const rmOther = await as("bob", "select public.remove_my_luma_email('alice.private@example.test') as out");
  check(rmOther.rows?.[0]?.out === false && (await mine("alice")).length === 1, "[member] cannot remove another member's Luma email");
  check((await as("bob", "select public.remove_my_luma_email(' Bob.Luma@example.test') as out")).rows?.[0]?.out === true, "[member] removes their own Luma email");
  check(!(await mine("bob")).includes("bob.luma@example.test"), "a removed Luma email is gone");
  // F1: 10 tries per member per day, refusals included; removing frees nothing. Bob has used 9.
  const tries = async () => (await db.query("select n from public.member_luma_email_tries where member_id = $1", [bob])).rows[0]?.n;
  check(await tries() === 9, "every try counts, refusals included (taken, invalid, own, exists, limit)");
  check(await addMine("bob", "b5@example.test") === "added", "the 10th try of the day still works");
  check(await addMine("bob", "b6@example.test") === "tries", "the 11th try of the day is refused");
  check(await addMine("bob", "alice@club.test") === "tries", "after the cap, another member's address gets the same answer (no probing)");
  await as("bob", "select public.remove_my_luma_email('b5@example.test')");
  check(await addMine("bob", "b7@example.test") === "tries", "removing an address doesn't free a try");
  check(await addMine("alice", "a9@example.test") === "added", "the cap is per member");
  await db.query("update public.member_luma_email_tries set day = day - 1 where member_id = $1", [bob]);
  check(await addMine("bob", "b8@example.test") === "added", "the next day the tries start over");
  check(await tries() === 1, "older days are dropped");
  const tr = await as("bob", "select * from public.member_luma_email_tries");
  check(denied(tr) || empty(tr), "[member] cannot read or reset the tries");
  check(denied(await as("bob", "delete from public.member_luma_email_tries")) || (await tries()) === 1, "[member] cannot delete the tries");
  check(denied(await as("guest", "select public.remove_my_luma_email('b2@example.test')")), "[guest] cannot remove a Luma email");
  await db.query("delete from public.member_luma_emails");
  await db.query("delete from public.member_emails where email = 'bob.smith@gmail.com'");
  await db.query("delete from public.events where id = $1", [lm]);

  // ---- 20. who reads what ------------------------------------------------------
  const read = (who) => as(who, "select member_id, event_id from public.attendance");
  const a = await read("alice");
  check(!denied(a) && a.rows.length === 1 && a.rows.every((r) => r.member_id === alice), "[alice] reads only her own attendance");
  const b = await read("bob");
  check(!denied(b) && b.rows.length === 2 && b.rows.every((r) => r.member_id === bob), "[bob] reads only his own attendance");
  check(empty(await read("outsider")), "[outsider] reads no attendance");
  const g = await read("guest");
  check(denied(g) || empty(g), "[guest] reads no attendance");
  check((await read("admin")).rows?.length === 3, "[admin] reads all attendance");
  check(empty(await as("alice", "select * from public.attendance_imports")), "[member] cannot read the import log or guest counts");
  check((await as("admin", "select * from public.attendance_imports")).rows?.length === 2, "[admin] reads the import log");

  for (const who of ["admin", "alice", "guest"]) {
    const ins = await as(who, "insert into public.attendance (event_id, member_id, status) values ($1, $2, 'checked_in')", [future, alice]);
    check(denied(ins), `[${who}] cannot insert attendance directly (only through the import)`);
  }
  const upd = await as("alice", "update public.attendance set status = 'checked_in'");
  check(denied(upd) || upd.affected === 0, "[alice] cannot change attendance");
  const del = await as("admin", "delete from public.attendance");
  check(denied(del) || del.affected === 0, "even an admin cannot delete attendance directly");

  // ---- 21. cleanup cascades ----------------------------------------------------
  await db.query("delete from public.events where id = any($1)", [[past, future]]);
  check(await count("select count(*) as n from public.attendance") === 0, "deleting an event deletes its attendance");
  check(await count("select count(*) as n from public.attendance_imports") === 0, "deleting an event deletes its import log");
}
