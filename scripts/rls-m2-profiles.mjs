// Milestone 2 checks for profiles, the avatars bucket, the member directory and
// admin_save_event(). Run by scripts/check-db.mjs after scripts/rls-m2.mjs.
//
// Uses the same JWT-claims + `set role` approach as rls-m2.mjs. It creates its own
// personas because rls-m2.mjs removes member2 at the end of its run.

const P = {
  admin: { id: "00000000-0000-4000-8000-00000000000a", email: "admin@club.test" }, // from rls-m2.mjs
  alice: { id: "00000000-0000-4000-8000-0000000000a1", email: "alice@club.test" },
  bob: { id: "00000000-0000-4000-8000-0000000000b2", email: "bob@club.test" },
  outsider: { id: "00000000-0000-4000-8000-00000000000d", email: "outsider@gmail.test" }, // from rls-m2.mjs
};

export async function runProfileChecks(db, check) {
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

  // ---- fixtures ---------------------------------------------------------------
  for (const who of ["alice", "bob"]) {
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [P[who].id, P[who].email]);
    await db.query(
      `with m as (insert into public.members (full_name) values ($1) returning id)
       insert into public.member_emails (email, member_id, is_primary) select $2, id, true from m`,
      [who === "alice" ? "Alice Member" : "Bob Member", P[who].email],
    );
    await as(who, "select * from public.claim_membership()");
  }
  const memberId = async (email) =>
    (await db.query("select member_id from public.member_emails where email = $1", [email])).rows[0].member_id;
  const alice = await memberId(P.alice.email);
  const bob = await memberId(P.bob.email);
  const base = "https://ref.supabase.co/storage/v1/object/authenticated/avatars";

  // ---- 12. avatars bucket ------------------------------------------------------
  {
    const b = (await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'")).rows[0];
    check(b && b.public === false, "avatars bucket exists and is private");
    check(b && Number(b.file_size_limit) === 2097152, "avatars bucket caps files at 2 MB");

    const put = (who, name) =>
      as(who, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [name]);
    check(!denied(await put("alice", `${alice}/a.jpg`)), "[alice] uploads into her own avatars folder");
    check(denied(await put("alice", `${bob}/evil.jpg`)), "[alice] cannot upload into bob's folder");
    check(denied(await put("alice", `a.jpg`)), "[alice] cannot upload outside any member folder");
    check(denied(await put("outsider", `${P.outsider.id}/a.jpg`)), "[outsider] cannot upload avatars");
    check(denied(await put("guest", `x/a.jpg`)), "[guest] cannot upload avatars");
    check(!denied(await put("bob", `${bob}/b.jpg`)), "[bob] uploads into his own folder");

    const read = (who) => as(who, "select name from storage.objects where bucket_id = 'avatars'");
    check((await read("alice")).rows?.length === 2, "[alice] (member) can read every avatar");
    check(empty(await read("outsider")), "[outsider] reads 0 avatars");
    const g = await read("guest");
    check(denied(g) || empty(g), "[guest] reads 0 avatars");

    const mv = await as("alice", "update storage.objects set name = $1 where name = $2", [`${alice}/moved.jpg`, `${bob}/b.jpg`]);
    check(!denied(mv) && mv.affected === 0, "[alice] cannot rename bob's avatar");
    const steal = await as("alice", "update storage.objects set name = $1 where name = $2", [`${bob}/x.jpg`, `${alice}/a.jpg`]);
    check(denied(steal), "[alice] cannot move her file into bob's folder");
    const del = await as("alice", "delete from storage.objects where name = $1", [`${bob}/b.jpg`]);
    check(!denied(del) && del.affected === 0, "[alice] cannot delete bob's avatar");
    const delOwn = await as("alice", "delete from storage.objects where name = $1", [`${alice}/a.jpg`]);
    check(delOwn.affected === 1, "[alice] can delete her own avatar");
    const delAdmin = await as("admin", "delete from storage.objects where name = $1", [`${bob}/b.jpg`]);
    check(delAdmin.affected === 1, "[admin] can delete any avatar");
  }

  // ---- 13. profile fields ------------------------------------------------------
  {
    const setPhoto = (url) =>
      as("alice", "update public.profiles set photo_url = $1 where member_id = public.current_member_id()", [url]);
    check((await setPhoto(`${base}/${alice}/a.jpg`)).affected === 1, "[alice] sets photo_url to her own folder");
    check(denied(await setPhoto(`${base}/${bob}/b.jpg`)), "[alice] cannot point photo_url at bob's folder");
    check(denied(await setPhoto("https://evil.example/x.jpg")), "[alice] cannot set photo_url to an outside URL");

    const setLinks = (links) =>
      as("alice", "update public.profiles set links = $1::jsonb where member_id = public.current_member_id()", [JSON.stringify(links)]);
    check(
      (await setLinks({ linkedin: "https://www.linkedin.com/in/alice", github: "https://github.com/alice", website: "https://alice.dev" })).affected === 1,
      "[alice] saves linkedin / github / website links",
    );
    check(denied(await setLinks({ website: "javascript:alert(1)" })), "profile links must be https");
    check(denied(await setLinks({ twitter: "https://x.com/a" })), "profile links accept only known keys");
    check(denied(await setLinks({ github: "https://evil.example/alice" })), "the github link must point at github.com");

    const direct = await as("alice", "update public.members set full_name = 'Hacked'");
    check(denied(direct) || direct.affected === 0, "[alice] cannot update members directly");
    check(!denied(await as("alice", "select public.update_my_name('  Alice B  ')")), "[alice] renames herself with update_my_name()");
    const name = (await db.query("select full_name from public.members where id = $1", [alice])).rows[0].full_name;
    check(name === "Alice B", "update_my_name() trims and saves only the caller's name");
    check(denied(await as("alice", "select public.update_my_name('')")), "update_my_name() rejects an empty name");
    check(denied(await as("outsider", "select public.update_my_name('Mallory')")), "[outsider] cannot call update_my_name()");
    check(denied(await as("guest", "select public.update_my_name('Mallory')")), "[guest] cannot call update_my_name()");
  }

  // ---- 14. member directory ----------------------------------------------------
  {
    const dir = await as("alice", "select * from public.member_directory()");
    check(dir.rows?.some((r) => r.id === bob), "[alice] sees bob in the member directory");
    check(dir.rows && !Object.keys(dir.rows[0]).some((k) => /email|role/.test(k)), "the directory has no emails or roles");
    check(empty(await as("outsider", "select * from public.member_directory()")), "[outsider] gets an empty directory");
    check(denied(await as("guest", "select * from public.member_directory()")), "[guest] cannot call member_directory()");

    const prof = (await as("bob", "select * from public.member_profile($1)", [alice])).rows?.[0];
    check(prof?.links?.github === "https://github.com/alice" && prof.is_self === false, "[bob] reads alice's profile (is_self = false)");
    const self = (await as("alice", "select * from public.member_profile($1)", [alice])).rows?.[0];
    check(self?.is_self === true, "[alice] reads her own profile (is_self = true)");
    check(empty(await as("outsider", "select * from public.member_profile($1)", [alice])), "[outsider] reads no member profile");
    check(denied(await as("guest", "select * from public.member_profile($1)", [alice])), "[guest] cannot call member_profile()");
  }

  // ---- 15. admin_save_event() --------------------------------------------------
  {
    const ids = (await db.query("select id from public.speakers where slug in ('shai-yahel', 'oz') order by slug")).rows.map((r) => r.id);
    const [oz, shai] = ids;
    const cohort = (await db.query("select id from public.cohorts where slug = '02'")).rows[0].id;
    const payload = {
      slug: "admin-made",
      cohort_id: cohort,
      kind: "lecture",
      title_he: "הרצאה",
      title_en: "Lecture",
      starts_at: "2027-03-03T16:00:00Z",
      ends_at: "2027-03-03T18:00:00Z",
      venue_id: "",
      is_tentative: true,
      status: "draft",
      speaker_ids: [shai, oz],
    };
    const save = (who, p) => as(who, "select public.admin_save_event($1::jsonb) as id", [JSON.stringify(p)]);

    check(denied(await save("alice", payload)), "[member] cannot call admin_save_event()");
    check(denied(await save("outsider", payload)), "[outsider] cannot call admin_save_event()");
    check(denied(await save("guest", payload)), "[guest] cannot call admin_save_event()");

    const created = await save("admin", payload);
    const id = created.rows?.[0]?.id;
    check(Boolean(id), `[admin] creates an event with admin_save_event()${created.error ? ` (${created.error})` : ""}`);
    const lineup = async () =>
      (await db.query("select speaker_id from public.event_speakers where event_id = $1 order by sort", [id])).rows.map((r) => r.speaker_id);
    check(JSON.stringify(await lineup()) === JSON.stringify([shai, oz]), "admin_save_event() stores the line-up in order");
    const ev = (await db.query("select venue_id, is_tentative, updated_by from public.events where id = $1", [id])).rows[0];
    check(ev?.venue_id === null && ev.is_tentative === true && ev.updated_by === P.admin.id, "venue TBD, tentative and updated_by are saved");

    const updated = await save("admin", { ...payload, id, title_en: "Renamed", status: "published", speaker_ids: [oz] });
    check(!denied(updated), "[admin] updates the event and its line-up");
    check(JSON.stringify(await lineup()) === JSON.stringify([oz]), "the old line-up is replaced, not appended");
    const pub = await as("guest", "select title_en from public.events where id = $1", [id]);
    check(pub.rows?.[0]?.title_en === "Renamed", "a published admin event is visible to guests");

    const bad = await save("admin", { ...payload, id, ends_at: payload.starts_at });
    check(denied(bad), "admin_save_event() still enforces ends_at > starts_at");
    check(JSON.stringify(await lineup()) === JSON.stringify([oz]), "a failed save leaves the line-up untouched");
    check(denied(await save("admin", { ...payload, id: "00000000-0000-4000-8000-000000000999" })), "admin_save_event() rejects an unknown id");
    check(denied(await save("admin", { ...payload, slug: "Bad Slug" })), "admin_save_event() enforces the slug format");

    const delSpeaker = await as("admin", "delete from public.speakers where id = $1", [oz]);
    check(denied(delSpeaker), "a speaker on an event cannot be deleted (FK restrict)");
    const delEvent = await as("admin", "delete from public.events where id = $1", [id]);
    check(delEvent.affected === 1, "[admin] deletes an event (its line-up cascades)");
  }
}
