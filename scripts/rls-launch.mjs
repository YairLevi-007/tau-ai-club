// Members-launch checks: private contact details (phone, contact email) with sharing
// toggles, the profile program field and the before_user_created
// auth hook. Run by scripts/check-db.mjs after the other RLS checks.
//
// Same JWT-claims + `set role` approach as rls-m2.mjs, with its own personas.

const P = {
  carol: { id: "00000000-0000-4000-8000-0000000000c3", email: "carol@club.test" },
  dave: { id: "00000000-0000-4000-8000-0000000000d4", email: "dave@club.test" },
  outsider: { id: "00000000-0000-4000-8000-00000000000d", email: "outsider@gmail.test" }, // from rls-m2.mjs
};

export async function runLaunchChecks(db, check) {
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

  // ---- fixtures -----------------------------------------------------------------
  for (const who of ["carol", "dave"]) {
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [P[who].id, P[who].email]);
    await db.query(
      `with m as (insert into public.members (full_name) values ($1) returning id)
       insert into public.member_emails (email, member_id, is_primary) select $2, id, true from m`,
      [who === "carol" ? "Carol Member" : "Dave Member", P[who].email],
    );
    await as(who, "select * from public.claim_membership()");
  }
  const memberId = async (email) =>
    (await db.query("select member_id from public.member_emails where email = $1", [email])).rows[0].member_id;
  const carol = await memberId(P.carol.email);
  const dave = await memberId(P.dave.email);

  // ---- L1. member_contacts is closed to every API role ----------------------------
  check(denied(await as("guest", "select * from public.member_contacts")), "[guest] cannot read member_contacts");
  check(denied(await as("carol", "select * from public.member_contacts")), "[member] cannot read member_contacts directly");
  check(denied(await as("outsider", "select * from public.member_contacts")), "[outsider] cannot read member_contacts");
  check(
    denied(await as("carol", "insert into public.member_contacts (member_id, phone) values ($1, '050-000-0000')", [carol])),
    "[member] cannot write member_contacts directly",
  );
  const profileCols = (
    await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles'")
  ).rows.map((r) => r.column_name);
  check(
    !profileCols.some((c) => /phone|email/.test(c)),
    "profiles (readable by every member) has no phone or email column",
  );

  // ---- L2. RPCs: guests and outsiders get nothing ---------------------------------
  for (const fn of [
    "public.my_contact()",
    `public.member_contact('${carol}')`,
    "public.update_my_contact('050-000-0000', 'x@y.test', true, true)",
  ]) {
    check(denied(await as("guest", `select * from ${fn}`)), `[guest] cannot call ${fn.replace(/\(.*/, "()")}`);
  }
  check(empty(await as("outsider", "select * from public.my_contact()")), "[outsider] my_contact() is empty");
  check(empty(await as("outsider", "select * from public.member_contact($1)", [carol])), "[outsider] member_contact() is empty");
  check(
    denied(await as("outsider", "select public.update_my_contact('050-000-0000', 'x@y.test', true, true)")),
    "[outsider] cannot save contact details",
  );

  // ---- L3. defaults: nothing shared -------------------------------------------------
  {
    const r = await as("carol", "select * from public.my_contact()");
    check(
      !r.error && r.rows.length === 1 && r.rows[0].phone === null && r.rows[0].share_phone === false && r.rows[0].share_email === false,
      "[member] my_contact() before saving: one row, empty, both toggles off",
    );
  }
  check(
    !denied(await as("carol", "select public.update_my_contact(' 050-123-4567 ', 'Carol.Contact@Gmail.test', false, false)")),
    "[carol] saves phone + contact email (toggles off)",
  );
  {
    const own = await as("carol", "select * from public.my_contact()");
    check(
      own.rows?.[0]?.phone === "050-123-4567" && own.rows?.[0]?.contact_email === "carol.contact@gmail.test",
      "[carol] sees her own phone and email (trimmed, lowercased)",
    );
    const self = await as("carol", "select * from public.member_contact($1)", [carol]);
    check(self.rows?.[0]?.phone === "050-123-4567", "[carol] member_contact(self) shows her own details even unshared");
    const other = await as("dave", "select * from public.member_contact($1)", [carol]);
    check(
      !other.error && (other.rows.length === 0 || (other.rows[0].phone === null && other.rows[0].contact_email === null)),
      "[dave] sees neither of carol's fields while both toggles are off",
    );
    const admin = (await db.query("select share_phone, share_email from public.member_contacts where member_id = $1", [carol])).rows[0];
    check(admin.share_phone === false && admin.share_email === false, "toggles are stored OFF by default");
  }

  // ---- L4. sharing one field at a time ----------------------------------------------
  await as("carol", "select public.update_my_contact('050-123-4567', 'carol.contact@gmail.test', true, false)");
  {
    const r = await as("dave", "select * from public.member_contact($1)", [carol]);
    check(r.rows?.[0]?.phone === "050-123-4567" && r.rows?.[0]?.contact_email === null, "[dave] sees carol's phone only once she shares it");
    check(empty(await as("outsider", "select * from public.member_contact($1)", [carol])), "[outsider] still sees nothing after sharing");
    check(denied(await as("guest", `select * from public.member_contact('${carol}')`)), "[guest] still denied after sharing");
  }
  await as("carol", "select public.update_my_contact('050-123-4567', 'carol.contact@gmail.test', false, true)");
  {
    const r = await as("dave", "select * from public.member_contact($1)", [carol]);
    check(r.rows?.[0]?.phone === null && r.rows?.[0]?.contact_email === "carol.contact@gmail.test", "[dave] sees carol's email only (phone toggled off again)");
  }
  check(
    denied(await as("carol", "select public.update_my_contact('call me maybe', null, false, false)")),
    "[carol] an invalid phone is rejected",
  );
  check(
    denied(await as("carol", "select public.update_my_contact(null, 'not-an-email', false, false)")),
    "[carol] an invalid contact email is rejected",
  );
  // dave cannot edit carol's row: update_my_contact only ever targets the caller.
  await as("dave", "select public.update_my_contact('052-999-9999', 'dave@x.test', false, false)");
  {
    const c = (await db.query("select phone from public.member_contacts where member_id = $1", [carol])).rows[0];
    check(c.phone === "050-123-4567", "[dave] saving his details never touches carol's row");
  }

  // ---- L5. profile program + member_profile has no contact data -----------------------
  {
    const up = await as("carol", "update public.profiles set program = 'Computer Science' where member_id = $1", [carol]);
    check(!up.error && up.affected === 1, "[carol] sets her own program");
    const other = await as("carol", "update public.profiles set program = 'x' where member_id = $1", [dave]);
    check(!other.error && other.affected === 0, "[carol] cannot set dave's program");
    const r = await as("dave", "select * from public.member_profile($1)", [carol]);
    check(r.rows?.[0]?.program === "Computer Science", "[dave] member_profile() includes program");
    check(r.rows?.[0] && !Object.keys(r.rows[0]).some((k) => /phone|email/.test(k)), "member_profile() has no phone or email");
    const dir = await as("dave", "select * from public.member_directory()");
    check(dir.rows?.[0] && !Object.keys(dir.rows[0]).some((k) => /phone|email/.test(k)), "member_directory() has no phone or email");
  }

  // ---- L7. before_user_created hook ---------------------------------------------------
  {
    const hook = async (email) =>
      (await db.query("select public.hook_before_user_created($1::jsonb) as r", [JSON.stringify({ user: { email } })])).rows[0].r;
    check(JSON.stringify(await hook("carol@club.test")) === "{}", "hook allows an allowlisted email");
    check(JSON.stringify(await hook("  CAROL@Club.Test ")) === "{}", "hook matches case-insensitively and trims");
    const no = await hook("stranger@gmail.test");
    check(no?.error?.http_code === 403, "hook rejects an email that isn't on the list");
    check((await hook(""))?.error?.http_code === 403, "hook rejects an empty email");
    const noUser = (await db.query("select public.hook_before_user_created('{}'::jsonb) as r")).rows[0].r;
    check(noUser?.error?.http_code === 403, "hook rejects an event with no user");
    check(
      denied(await as("guest", "select public.hook_before_user_created('{\"user\":{\"email\":\"carol@club.test\"}}'::jsonb)")),
      "[guest] cannot call the auth hook (no allowlist probing)",
    );
    check(
      denied(await as("carol", "select public.hook_before_user_created('{\"user\":{\"email\":\"carol@club.test\"}}'::jsonb)")),
      "[member] cannot call the auth hook",
    );
    await db.exec("set role supabase_auth_admin");
    let ok = false;
    try {
      const r = await db.query("select public.hook_before_user_created('{\"user\":{\"email\":\"carol@club.test\"}}'::jsonb) as r");
      ok = JSON.stringify(r.rows[0].r) === "{}";
    } catch {
      ok = false;
    } finally {
      await db.exec("reset role");
    }
    check(ok, "[supabase_auth_admin] can call the auth hook");
  }
}
