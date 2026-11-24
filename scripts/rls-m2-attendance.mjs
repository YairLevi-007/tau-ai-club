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
