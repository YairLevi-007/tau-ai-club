// Initiatives (יוזמות) checks: supabase/migrations/20261120000000_initiatives.sql.
// Run by scripts/check-db.mjs after the other RLS checks, whose personas it reuses
// (scripts/rls-m2.mjs): admin, outsider (signed in, not on the list), spoofed (JWT claims a
// member's email) and guests, plus two fresh members of its own: lea (a lead) and jo (a joiner).
//
// What must hold:
//   * guests and non-members see no initiative and no join, and can't call any RPC;
//   * a member's proposal is invisible to other members until an admin publishes it;
//   * members write only through the RPCs (no direct insert/update/delete);
//   * who joined: each member sees only their own joins; names only for the lead and admins,
//     never an email; everyone else gets counts; inactive members never show by name;
//   * the review flow (return with a note, edit and resend, publish as the club's, reject),
//     spots, sign-up closing, the lead can't join, the 5-waiting spam guard.

const P = {
  admin: { id: "00000000-0000-4000-8000-00000000000a", email: "admin@club.test" },
  // Fresh members for these checks (rls-m2.mjs removes member2 and renames others on the way).
  lea: { id: "00000000-0000-4000-8000-0000000001e1", email: "lea@club.test", name: "Lea Lead" },
  jo: { id: "00000000-0000-4000-8000-0000000001e2", email: "jo@club.test", name: "Jo Joiner" },
  outsider: { id: "00000000-0000-4000-8000-00000000000d", email: "outsider@gmail.test" },
  spoofed: { id: "00000000-0000-4000-8000-00000000000f", email: "lea@club.test" },
};

export async function runInitiativeChecks(db, check) {
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
  for (const who of ["lea", "jo"]) {
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [P[who].id, P[who].email]);
    await db.query(
      `with m as (insert into public.members (full_name) values ($1) returning id)
       insert into public.member_emails (email, member_id, is_primary) select $2, id, true from m`,
      [P[who].name, P[who].email],
    );
  }
  const leaMember = (await db.query("select member_id from public.member_emails where email = $1", [P.lea.email])).rows[0].member_id;
  const joMember = (await db.query("select member_id from public.member_emails where email = $1", [P.jo.email])).rows[0].member_id;
  const denied = (r) => Boolean(r.error) || r.affected === 0;
  const propose = (who, title, extra = {}) =>
    as(
      who,
      "select public.propose_initiative($1, $9::public.initiative_kind, $2::public.initiative_category, $3, $4, $5, $6, $7, $8::date) as id",
      [extra.lang ?? "he", extra.category ?? "hackathon", title, extra.summary ?? "כמה מילים", extra.when ?? null, extra.where ?? null, extra.spots ?? null, extra.until ?? null, extra.kind ?? "member"],
    );
  const SEE = "select id, status::text, kind::text, title_he, title_en, review_note from public.initiatives";
  const ids = (r) => (r.rows ?? []).map((x) => x.id);

  // ---- a member proposes: pending, visible to the lead and admins only -------------------
  const p1 = await propose("lea", "האקתון סוכני AI לקמפוס", { when: "10–11 בדצמבר", where: "בניין שרייבר", spots: 40 });
  check(!p1.error && p1.rows?.[0]?.id, `initiatives: a member proposes (${p1.error ?? "ok"})`);
  const id1 = p1.rows?.[0]?.id;
  const own = await as("lea", SEE);
  check(own.rows?.some((r) => r.id === id1 && r.status === "pending" && r.kind === "member"), "initiatives: the proposal is pending, a member's, and the lead sees it");
  for (const who of ["jo", "outsider", "spoofed", "guest"]) {
    const r = await as(who, SEE);
    check(!ids(r).includes(id1), `initiatives: ${who} doesn't see a pending proposal (${r.error ?? r.rows.length + " rows"})`);
  }
  const adminSees = await as("admin", SEE);
  check(ids(adminSees).includes(id1), "initiatives: admins see the pending proposal");

  // ---- no direct writes for members --------------------------------------------------------
  check(denied(await as("lea", "insert into public.initiatives (lead_id, title_he, status, published_at) values ($1, 'x', 'published', now())", [leaMember])), "initiatives: a member can't insert a row directly (e.g. already published)");
  check(denied(await as("lea", "update public.initiatives set status = 'published', published_at = now(), review_note = null where id = $1", [id1])), "initiatives: a lead can't publish their own proposal by updating the row");
  check(denied(await as("lea", "delete from public.initiatives where id = $1", [id1])), "initiatives: a member can't delete rows directly");
  check(denied(await as("lea", "insert into public.initiative_members (initiative_id, member_id) values ($1, $2)", [id1, joMember])), "initiatives: a member can't add anyone (or themselves) to the join table directly");

  // ---- guests and non-members can't use the RPCs ------------------------------------------
  for (const who of ["guest", "outsider", "spoofed"]) {
    check(Boolean((await propose(who, "spam")).error), `initiatives: ${who} can't propose`);
    check(Boolean((await as(who, "select * from public.initiative_cards()")).error), `initiatives: ${who} can't read the cards`);
    check(Boolean((await as(who, "select public.join_initiative($1)", [id1])).error), `initiatives: ${who} can't join`);
  }

  // ---- review: only admins; return needs a note ---------------------------------------------
  check(Boolean((await as("jo", "select public.admin_review_initiative($1, 'publish')", [id1])).error), "initiatives: a member can't review");
  check(Boolean((await as("lea", "select public.admin_review_initiative($1, 'publish')", [id1])).error), "initiatives: the lead can't approve their own proposal");
  check(Boolean((await as("admin", "select public.admin_review_initiative($1, 'return')", [id1])).error), "initiatives: returning without a note is refused");
  const ret = await as("admin", "select public.admin_review_initiative($1, 'return', false, 'חסר תאריך ומקום')", [id1]);
  check(!ret.error, `initiatives: an admin returns it with a note (${ret.error ?? "ok"})`);
  const back = (await as("lea", SEE)).rows.find((r) => r.id === id1);
  check(back?.status === "returned" && back?.review_note === "חסר תאריך ומקום", "initiatives: the lead sees it returned, with the note");
  check(!ids(await as("jo", SEE)).includes(id1), "initiatives: other members still don't see a returned proposal");

  // ---- the lead edits and resends; someone else can't --------------------------------------
  const UPD = "select public.update_my_initiative($1, 'he', 'club', 'hackathon', $2, 'יומיים לבנות סוכן', 'חמישי–שישי, 10–11 בדצמבר', 'בניין שרייבר, חדר 006', 40, null)";
  check(Boolean((await as("jo", UPD, [id1, "חטיפה"])).error), "initiatives: another member can't edit someone's proposal");
  const upd = await as("lea", UPD, [id1, "האקתון סוכני AI לקמפוס"]);
  check(!upd.error, `initiatives: the lead edits a returned proposal (${upd.error ?? "ok"})`);
  check((await as("lea", SEE)).rows.find((r) => r.id === id1)?.status === "pending", "initiatives: an edited proposal goes back to pending");
  const asked = (await as("lea", "select kind::text, proposed_kind::text from public.initiatives where id = $1", [id1])).rows[0];
  check(asked?.proposed_kind === "club" && asked?.kind === "member", "initiatives: the lead can ask for a club initiative; it stays a member's until an admin decides");

  // ---- publish with the club switch ----------------------------------------------------------
  const pub = await as("admin", "select public.admin_review_initiative($1, 'publish', true, null, 'המועדון עוזר עם חדר ואוכל')", [id1]);
  check(!pub.error, `initiatives: an admin publishes it as the club's (${pub.error ?? "ok"})`);
  const live = (await as("jo", "select id, status::text, kind::text, review_note, club_reason_he, lead_id from public.initiatives where id = $1", [id1])).rows[0];
  check(live?.status === "published" && live?.kind === "club" && live?.review_note === null, "initiatives: members now see it, as a club initiative, with no admin note left on it");
  check(live?.club_reason_he === "המועדון עוזר עם חדר ואוכל" && live?.lead_id === leaMember, "initiatives: the 'why it's the club's' is stored; the proposer stays the lead");
  check(Boolean((await as("admin", "select public.admin_review_initiative($1, 'reject')", [id1])).error), "initiatives: a published initiative isn't in the queue any more");
  check(Boolean((await as("lea", "select public.update_my_initiative($1, 'he', 'member', 'hackathon', 'שינוי', null, null, null, null, null)", [id1])).error), "initiatives: the lead can't edit it once it's published");
  check(Boolean((await as("lea", "select public.withdraw_my_initiative($1)", [id1])).error), "initiatives: the lead can't withdraw a published one");

  // ---- the admin has the final say: a "club" request published as a member's ------------------
  const asksClub = await propose("lea", "ערב פיצה ומודלים פתוחים", { kind: "club" });
  const idAsk = asksClub.rows?.[0]?.id;
  check((await as("lea", "select proposed_kind::text from public.initiatives where id = $1", [idAsk])).rows[0]?.proposed_kind === "club", "initiatives: a member proposes a club initiative (stored as the request)");
  check(!(await as("admin", "select public.admin_review_initiative($1, 'publish', false)", [idAsk])).error, "initiatives: the admin publishes it with the switch off");
  check((await as("jo", "select kind::text from public.initiatives where id = $1", [idAsk])).rows[0]?.kind === "member", "initiatives: the admin's switch wins: it's shown as a member's initiative");
  check(Boolean((await as("lea", "select public.update_my_initiative($1, 'he', 'club', 'hackathon', 'עכשיו של המועדון', null, null, null, null)", [idAsk])).error), "initiatives: the lead can't turn a published one into the club's");

  // ---- an admin's own initiative goes up at once, as the club's ------------------------------
  const a1 = await propose("admin", "מתנדבים לערב הפתיחה של מחזור 03", { category: "volunteering", spots: 2 });
  const idA = a1.rows?.[0]?.id;
  const aRow = (await as("jo", "select status::text, kind::text from public.initiatives where id = $1", [idA])).rows[0];
  check(aRow?.status === "published" && aRow?.kind === "club", "initiatives: an admin's own initiative is published at once, as a club initiative");

  // ---- "I'm in": join, leave, spots, the lead, sign-up closing --------------------------------
  check(!(await as("jo", "select public.join_initiative($1)", [idA])).error, "initiatives: a member joins");
  check(!(await as("jo", "select public.join_initiative($1)", [idA])).error, "initiatives: joining twice is a no-op");
  check(!(await as("lea", "select public.join_initiative($1)", [idA])).error, "initiatives: a second member joins (2 of 2 spots)");
  const full = await as("admin", "select public.join_initiative($1)", [idA]);
  check(Boolean(full.error), "initiatives: the lead (here the admin) can't join their own");
  const extra = await propose("admin", "מקום אחד", { spots: 1 });
  const idOne = extra.rows?.[0]?.id;
  await as("lea", "select public.join_initiative($1)", [idOne]);
  check(/no spots left/.test((await as("jo", "select public.join_initiative($1)", [idOne])).error ?? ""), "initiatives: a full initiative refuses another join");
  const closed = await propose("admin", "ההרשמה נסגרה", { until: "2020-01-01" });
  check(/closed/.test((await as("lea", "select public.join_initiative($1)", [closed.rows?.[0]?.id])).error ?? ""), "initiatives: sign-up after the date is refused");
  check(Boolean((await as("jo", "select public.join_initiative($1)", [id1])).error) === false, "initiatives: a member joins the published member initiative");
  check(Boolean((await as("lea", "select public.join_initiative($1)", [id1])).error), "initiatives: the lead can't join their own initiative");

  // ---- who joined: own rows only; names for the lead and admins; never an email --------------
  const mine = await as("jo", "select initiative_id, member_id from public.initiative_members");
  check(!mine.error && mine.rows.length > 0 && mine.rows.every((r) => r.member_id === joMember), "initiatives: a member sees only their own joins in the table");
  const leadPeople = await as("lea", "select * from public.initiative_people($1)", [id1]);
  check(!leadPeople.error && leadPeople.rows.length === 1 && leadPeople.rows[0].full_name === "Jo Joiner", `initiatives: the lead sees the joiners' names (${leadPeople.error ?? JSON.stringify(leadPeople.rows.map((r) => r.full_name))})`);
  check(leadPeople.rows?.every((r) => Object.keys(r).sort().join() === "full_name,joined_at,member_id,photo_url") && !JSON.stringify(leadPeople.rows).includes("@"), "initiatives: the people list holds names and photos only, no email");
  check(Boolean((await as("jo", "select * from public.initiative_people($1)", [id1])).error), "initiatives: a member who isn't the lead can't list who's in");
  check(Boolean((await as("lea", "select * from public.initiative_people($1)", [idA])).error), "initiatives: a joiner can't list who else is in");
  const adminPeople = await as("admin", "select * from public.initiative_people($1)", [idA]);
  check(!adminPeople.error && adminPeople.rows.length === 2, "initiatives: admins see who's in on any initiative");

  // ---- cards: counts and "I'm in", only for what the caller may see ---------------------------
  const p2 = await propose("lea", "בוט שעונה לסטודנטים חדשים");
  const idPending = p2.rows?.[0]?.id;
  const cards2 = await as("jo", "select * from public.initiative_cards()");
  const c1 = cards2.rows?.find((r) => r.initiative_id === id1);
  check(!cards2.error && c1?.joined_count === 1 && c1?.i_joined === true && c1?.lead_name === "Lea Lead", "initiatives: cards give the count, 'I'm in' and the lead's name");
  check(!cards2.rows?.some((r) => r.initiative_id === idPending), "initiatives: cards don't include someone else's pending proposal");
  check(cards2.rows?.every((r) => !Object.keys(r).some((k) => /email|phone/.test(k))), "initiatives: cards carry no contact fields");
  check((await as("lea", "select * from public.initiative_cards()")).rows?.some((r) => r.initiative_id === idPending), "initiatives: the lead's own pending proposal is in their cards");

  // ---- leave ---------------------------------------------------------------------------------------
  check(!(await as("jo", "select public.leave_initiative($1)", [id1])).error, "initiatives: a member cancels 'I'm in'");
  check((await as("lea", "select * from public.initiative_people($1)", [id1])).rows?.length === 0, "initiatives: after cancelling, the lead's list is empty");

  // ---- reject, and withdraw ---------------------------------------------------------------------
  check(!(await as("admin", "select public.admin_review_initiative($1, 'reject', false, 'לא מתאים כרגע')", [idPending])).error, "initiatives: an admin rejects a proposal");
  const rej = (await as("lea", SEE)).rows.find((r) => r.id === idPending);
  check(rej?.status === "rejected" && rej?.review_note === "לא מתאים כרגע", "initiatives: the lead sees it rejected, with the note");
  check(!ids(await as("jo", SEE)).includes(idPending), "initiatives: other members never see a rejected proposal");
  check(Boolean((await as("jo", "select public.withdraw_my_initiative($1)", [idPending])).error), "initiatives: a member can't withdraw someone else's proposal");
  check(!(await as("lea", "select public.withdraw_my_initiative($1)", [idPending])).error, "initiatives: the lead withdraws their rejected proposal");

  // ---- spam guard: 5 waiting proposals per member -----------------------------------------------
  for (let i = 0; i < 5; i++) await propose("jo", `הצעה ${i + 1}`);
  check(/too many/.test((await propose("jo", "הצעה 6")).error ?? ""), "initiatives: a 6th waiting proposal is refused");
  // A rejected proposal frees a waiting slot, but not today's: at most 5 new ones in 24 hours.
  const joWaiting = (await as("jo", "select id from public.initiatives where status = 'pending'")).rows.map((r) => r.id);
  for (const id of joWaiting) await as("admin", "select public.admin_review_initiative($1, 'reject', false, 'לא כרגע')", [id]);
  check(/too many proposals today/.test((await propose("jo", "הצעה 7")).error ?? ""), "initiatives: a 6th proposal in 24 hours is refused, even after rejections");

  // ---- language columns and bad input ------------------------------------------------------------
  const en = await propose("lea", "Reading group: papers on Agents", { lang: "en" });
  const enRow = (await as("lea", "select title_he, title_en from public.initiatives where id = $1", [en.rows?.[0]?.id])).rows[0];
  check(enRow?.title_en === "Reading group: papers on Agents" && enRow?.title_he === null, "initiatives: English text goes to the _en columns");
  check(Boolean((await propose("lea", "   ")).error), "initiatives: an empty title is refused");
  check(Boolean((await propose("lea", "x", { lang: "fr" })).error), "initiatives: an unknown language is refused");
  check(Boolean((await propose("lea", "x".repeat(121))).error), "initiatives: a title over 120 characters is refused");

  // ---- inactive members don't show by name (security review F1) ---------------------------------
  // The enum has only 'active' today; the join flow adds more later. Add one here to test with.
  await db.exec("alter type public.member_status add value if not exists 'inactive'");
  const idF = (await propose("admin", "ערב פתיחה")).rows?.[0]?.id;
  check(!(await as("jo", "select public.join_initiative($1)", [idF])).error, "initiatives: jo joins the admin's initiative");
  await db.query("update public.members set status = 'inactive' where id = $1", [joMember]);
  check((await as("admin", "select * from public.initiative_people($1)", [idF])).rows?.length === 0, "initiatives: an inactive joiner isn't listed by name");
  check((await as("admin", "select joined_count from public.initiative_cards() where initiative_id = $1", [idF])).rows?.[0]?.joined_count === 0, "initiatives: an inactive joiner isn't counted");
  check(Boolean((await as("jo", "select * from public.initiative_cards()")).error), "initiatives: an inactive member can't read the cards");
  await db.query("update public.members set status = 'inactive' where id = $1", [leaMember]);
  const goneLead = (await as("admin", "select lead_name, lead_photo from public.initiative_cards() where initiative_id = $1", [id1])).rows?.[0];
  check(goneLead && goneLead.lead_name === null && goneLead.lead_photo === null, "initiatives: an inactive lead's name and photo aren't shown");
  check(ids(await as("admin", SEE)).includes(id1), "initiatives: an inactive lead's initiative stays for the admin to decide");
  await db.query("update public.members set status = 'active' where id in ($1, $2)", [leaMember, joMember]);

  // ---- clean up (later checks and the fixture export don't expect these rows) --------------------
  await db.exec("delete from public.initiatives");
}
