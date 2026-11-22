// pAIr checks (1:1 intro conversations, supabase/migrations/20261122000000_pair_icebreakers.sql).
// Run by scripts/check-db.mjs after the attendance checks, whose personas (alice, bob: members;
// outsider: not on the allowlist; admin) it reuses.

const P = {
  admin: { id: "00000000-0000-4000-8000-00000000000a", email: "admin@club.test" },
  alice: { id: "00000000-0000-4000-8000-0000000000a1", email: "alice@club.test" },
  bob: { id: "00000000-0000-4000-8000-0000000000b2", email: "bob@club.test" },
  carol: { id: "00000000-0000-4000-8000-0000000000c3", email: "carol.pair@club.test" },
  outsider: { id: "00000000-0000-4000-8000-00000000000d", email: "outsider@gmail.test" },
};

export async function runPairChecks(db, check) {
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
  const one = (r) => r.rows?.[0]?.out;

  // ---- fixtures: carol, a third member; a second (past) event for history ----
  const member = async (email) => (await db.query("select member_id from public.member_emails where email = $1", [email])).rows[0]?.member_id;
  const carolId = (
    await db.query("insert into public.members (full_name) values ('Carol Pair') returning id")
  ).rows[0].id;
  await db.query("insert into public.member_emails (email, member_id, is_primary) values ($1, $2, true)", [P.carol.email, carolId]);
  const alice = await member(P.alice.email);
  const bob = await member(P.bob.email);
  const carol = await member(P.carol.email);
  check(Boolean(alice && bob && carol), "pair fixtures: alice, bob and carol are members");
  const cohort = (await db.query("select id from public.cohorts where slug = '02'")).rows[0].id;
  const future = (
    await db.query(
      `insert into public.events (slug, cohort_id, title_he, title_en, starts_at, ends_at, status)
       values ('pair-future', $1, 'מפגש', 'Meetup', now() + interval '3 days', now() + interval '3 days 2 hours', 'published') returning id`,
      [cohort],
    )
  ).rows[0].id;
  // bob registered on Luma; alice declined (not in the import); carol isn't in it.
  await db.query("insert into public.attendance (event_id, member_id, status) values ($1, $2, 'registered')", [future, bob]);

  // ---- 1. who may run the admin side ----------------------------------------
  const open = (who, ev) => as(who, "select public.admin_pair_open_round($1) as out", [ev]);
  for (const who of ["alice", "outsider", "guest"]) {
    check(denied(await open(who, future)), `[${who}] cannot open a pAIr round`);
  }
  check(denied(await open("admin", "00000000-0000-4000-8000-000000000999")), "opening a round rejects an unknown event");

  // ---- 2. opening fills in who registered on Luma ----------------------------
  const round = one(await open("admin", future));
  check(Boolean(round), "[admin] opens a round for a meetup");
  check(one(await open("admin", future)) === round, "opening again returns the same round (one per meetup)");
  const people = async () =>
    (await db.query("select member_id, source from public.pair_round_people where round_id = $1 order by member_id", [round])).rows;
  const first = await people();
  check(first.length === 1 && first[0].member_id === bob && first[0].source === "luma", "the round starts with the Luma registrants (bob)");

  // ---- 3. who is coming ------------------------------------------------------
  const setPeople = (who, ids) => as(who, "select public.admin_pair_set_people($1, $2::uuid[]) as out", [round, ids]);
  check(denied(await setPeople("alice", [alice, bob])), "[member] cannot change who is coming");
  check(denied(await setPeople("admin", [alice, "00000000-0000-4000-8000-000000000999"])), "the list rejects someone who isn't a member");
  check(one(await setPeople("admin", [alice, bob, carol, alice])) === 3, "[admin] sets who is coming (duplicates ignored)");
  const listed = await people();
  check(listed.length === 3, "three people are coming");
  check(listed.find((r) => r.member_id === bob)?.source === "luma" && listed.find((r) => r.member_id === alice)?.source === "manual", "Luma registrants stay 'luma', added people are 'manual'");

  // ---- 4. conversations ------------------------------------------------------
  const save = (who, groups) => as(who, "select public.admin_pair_save_groups($1, $2::jsonb) as out", [round, JSON.stringify(groups)]);
  check(denied(await save("alice", [[alice, bob, carol]])), "[member] cannot save conversations");
  check(denied(await save("admin", [[alice]])), "a conversation of one is rejected");
  check(denied(await save("admin", [[alice, bob], [bob, carol]])), "nobody can be in two conversations");
  check(denied(await save("admin", [[alice, bob, carol, alice]])), "a conversation of four is rejected");
  const adminMember = await member(P.admin.email); // a member, but not coming
  check(denied(await save("admin", [[alice, adminMember]])), "everyone in a conversation must be on the round's list");
  check(denied(await save("admin", [["not-a-uuid", alice]])), "conversations take member ids only");
  check(denied(await save("admin", { a: 1 })), "conversations must be an array");
  check(one(await save("admin", [[alice, bob], [carol, alice]])) === undefined, "a failed save returns nothing");
  check(one(await save("admin", [[alice, bob, carol]])) === 1, "[admin] saves a trio");
  check(one(await save("admin", [[alice, bob]])) === 1, "[admin] replaces it with a pair");
  const groups = (await db.query("select g.id, array_agg(m.member_id) as ids from public.pair_groups g join public.pair_group_members m on m.group_id = g.id where g.round_id = $1 group by g.id", [round])).rows;
  check(groups.length === 1 && groups[0].ids.length === 2, "saving replaces the previous conversations");
  const groupId = groups[0].id;

  // ---- 5. nobody but admins sees a draft --------------------------------------
  const matches = (who) => as(who, "select public.my_pair_matches() as out");
  check(JSON.stringify(one(await matches("alice"))) === "[]", "[alice] sees no conversation while the round is a draft");
  const publish = (who, on) => as(who, "select public.admin_pair_publish($1, $2)", [round, on]);
  check(denied(await publish("alice", true)), "[member] cannot publish");
  check(!denied(await publish("admin", true)), "[admin] publishes the round");

  // ---- 6. after publishing, each member sees only their own conversation ------
  const am = one(await matches("alice"));
  check(Array.isArray(am) && am.length === 1 && am[0].round_id === round, "[alice] sees her conversation");
  check(am?.[0]?.partners?.length === 1 && am[0].partners[0].id === bob, "[alice] sees bob as her partner");
  check(!/@|email|phone|role/.test(JSON.stringify(am)), "partners carry no email, phone or role");
  check(one(await matches("bob"))?.[0]?.partners?.[0]?.id === alice, "[bob] sees alice as his partner");
  check(JSON.stringify(one(await matches("carol"))) === "[]", "[carol] (coming, not matched) sees nothing");
  const om = await matches("outsider");
  check(denied(om) || JSON.stringify(one(om)) === "[]", "[outsider] sees nothing");
  check(denied(await matches("guest")), "[guest] cannot call my_pair_matches()");

  for (const t of ["pair_rounds", "pair_round_people", "pair_groups", "pair_group_members", "pair_confirms"]) {
    check(empty(await as("alice", `select * from public.${t}`)), `[member] reads nothing from ${t} directly`);
    const g = await as("guest", `select * from public.${t}`);
    check(denied(g) || empty(g), `[guest] reads nothing from ${t}`);
    check(!(await as("admin", `select * from public.${t}`)).error, `[admin] reads ${t}`);
  }
  check(denied(await as("alice", "insert into public.pair_confirms (round_id, member_id) values ($1, $2)", [round, alice])), "[member] cannot insert a confirmation directly");
  check(denied(await as("admin", "update public.pair_rounds set status = 'draft', published_at = null")), "even an admin cannot write a pAIr table directly");

  // ---- 7. a published round is frozen -----------------------------------------
  check(denied(await setPeople("admin", [alice, bob])), "who is coming can't change once published");
  check(denied(await save("admin", [[bob, carol]])), "conversations can't change once published");

  // ---- 8. "the meeting happened" ---------------------------------------------
  const confirm = (who, on, r = round) => as(who, "select public.confirm_my_pair($1, $2) as out", [r, on]);
  check(denied(await confirm("carol", true)), "[carol] cannot confirm a conversation she isn't in");
  check(denied(await confirm("outsider", true)), "[outsider] cannot confirm");
  check(denied(await confirm("guest", true)), "[guest] cannot confirm");
  const at = one(await confirm("alice", true));
  check(Boolean(at), "[alice] confirms her conversation happened");
  check(Boolean(one(await matches("alice"))?.[0]?.confirmed_at), "[alice] sees her confirmation");
  check(one(await matches("bob"))?.[0]?.confirmed_at === null, "alice's confirmation is hers only (bob's stays empty)");
  check(one(await confirm("alice", false)) === null && one(await matches("alice"))?.[0]?.confirmed_at === null, "[alice] takes her confirmation back");
  await confirm("alice", true);

  // ---- 9. admin marks --------------------------------------------------------
  const mark = (who, m) => as(who, "select public.admin_pair_mark_group($1, $2)", [groupId, m]);
  check(denied(await mark("alice", "met")), "[member] cannot mark a conversation");
  check(denied(await mark("admin", "maybe")), "a mark is met, missed or nothing");
  check(!denied(await mark("admin", "missed")), "[admin] marks a conversation as missed");
  check((await db.query("select mark from public.pair_groups where id = $1", [groupId])).rows[0].mark === "missed", "the mark is stored");
  check(!denied(await mark("admin", null)), "[admin] clears the mark");

  // ---- 10. back to draft clears the confirmations ------------------------------
  check(!denied(await publish("admin", false)), "[admin] takes the round back to draft");
  check(Number((await db.query("select count(*) as n from public.pair_confirms where round_id = $1", [round])).rows[0].n) === 0, "taking a round back clears its confirmations");
  check(JSON.stringify(one(await matches("alice"))) === "[]", "[alice] no longer sees the conversation");
  check(denied(await confirm("alice", true)), "nobody can confirm a draft round");
  check(denied(await mark("admin", "met")), "a draft round's conversations can't be marked");
  check(denied(await as("admin", "select public.admin_pair_publish($1, true)", ["00000000-0000-4000-8000-000000000999"])), "publishing rejects an unknown round");

  // ---- 11. changing the list clears the conversations --------------------------
  check(!denied(await setPeople("admin", [alice, bob])), "[admin] changes who is coming on a draft");
  check(Number((await db.query("select count(*) as n from public.pair_groups where round_id = $1", [round])).rows[0].n) === 0, "a changed list clears the conversations");
  check(denied(await publish("admin", true)), "a round with no conversations can't be published");

  // ---- 12. deleting --------------------------------------------------------------
  const del = (who) => as(who, "select public.admin_pair_delete_round($1)", [round]);
  check(denied(await del("alice")), "[member] cannot delete a round");
  check(!denied(await del("admin")), "[admin] deletes a round");
  check(Number((await db.query("select count(*) as n from public.pair_round_people where round_id = $1", [round])).rows[0].n) === 0, "deleting a round removes its list");

  // Leave no trace for the checks that follow.
  await db.query("delete from public.members where id = $1", [carol]);
  await db.query("delete from public.events where id = $1", [future]);
}
