-- Luma emails matched to the right member (25.11). Only club members come to sessions, but many
-- register on Luma with another address than the one on the site (a private Gmail, an Apple
-- hidden-relay address, a typo, a Gmail dot variant), so the import counted them as guests and
-- they missed their attendance and pAIr. Three parts:
--
--   1. email_match_key(): one key per mailbox. Lower case, trimmed, Unicode NFKC (a PDF turned
--      "fi" into the ligature "ﬁ"), and for Gmail the dots and "+tag" in the local part dropped
--      (gal.shani77@gmail.com = galshani77+luma@googlemail.com).
--   2. member_luma_emails: addresses an admin linked to a member from an upload, used ONLY to
--      match Luma uploads. Deliberately not member_emails: that table is also the sign-in
--      allowlist, and a Luma address (or a wrong link) must never become a way to sign in as the
--      member. Admins only, like member_emails.
--   3. admin_import_attendance(): matches through member_emails AND member_luma_emails by that
--      key, and its result now also lists the upload's unmatched emails, so the admin can link
--      them. The statuses, the counts, the guest rule and everything pAIr reads are unchanged.
--
-- Non-member emails are still never stored: the unmatched list is only returned to the admin's
-- browser (which sent those emails in the first place) and lives there until the page is left.
-- An address is stored only when an admin links it to a member, and then it is that member's.

-- ---- 1. the match key ----------------------------------------------------------------------
create or replace function public.email_match_key(p_email text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when split_part(e, '@', 2) in ('gmail.com', 'googlemail.com')
             then replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com'
           else e
         end
  from (select lower(btrim(normalize(coalesce(p_email, ''), NFKC))) as e) x;
$$;

revoke all on function public.email_match_key(text) from public, anon;
grant execute on function public.email_match_key(text) to authenticated;

-- ---- 2. Luma addresses linked to a member --------------------------------------------------
create table public.member_luma_emails (
  email       extensions.citext primary key
                check (char_length(email::text) <= 254 and email::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  member_id   uuid not null references public.members (id) on delete cascade,
  linked_by   uuid references public.members (id) on delete set null default public.current_member_id(),
  created_at  timestamptz not null default now()
);
create index member_luma_emails_member_idx on public.member_luma_emails (member_id);

revoke all on public.member_luma_emails from public, anon, authenticated;
grant select, insert, delete on public.member_luma_emails to authenticated;
alter table public.member_luma_emails enable row level security;
create policy "admins manage luma emails"
  on public.member_luma_emails for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---- 3. the import: match by key through both tables, list what didn't match --------------
-- Same function as 20261117000000_m2_attendance.sql; only the member lookup and the returned
-- 'unmatched' list are new.
create or replace function public.admin_import_attendance(p_event_id uuid, p_rows jsonb, p_commit boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ends      timestamptz;
  v_admin     uuid := public.current_member_id();
  v_members   jsonb;
  v_unmatched jsonb;
  v_total     int;
  v_ignored   int;
  v_g_reg     int;
  v_g_in      int;
begin
  perform public.assert_admin();
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'too many rows (max 5000)' using errcode = '22023';
  end if;
  select e.ends_at into v_ends from public.events e where e.id = p_event_id;
  if not found then
    raise exception 'unknown event' using errcode = '22023';
  end if;

  create temporary table if not exists pg_temp.att_rows (
    email extensions.citext, going boolean, checked_in boolean, checked_in_at timestamptz, member_id uuid,
    self_added boolean not null default false
  ) on commit drop;
  truncate pg_temp.att_rows;

  insert into pg_temp.att_rows (email, going, checked_in, checked_in_at)
  select lower(btrim(coalesce(x ->> 'email', '')))::extensions.citext,
         coalesce((x ->> 'going')::boolean, false),
         coalesce((x ->> 'checked_in')::boolean, false) or nullif(x ->> 'checked_in_at', '') is not null,
         nullif(x ->> 'checked_in_at', '')::timestamptz
  from jsonb_array_elements(p_rows) as x;

  v_total := (select count(*) from pg_temp.att_rows);
  delete from pg_temp.att_rows r where r.email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or not (r.going or r.checked_in);
  v_ignored := v_total - (select count(*) from pg_temp.att_rows);

  -- A member's sign-in emails and the Luma addresses linked to them, matched by mailbox key.
  -- self_added: the match came through an address the member added themselves (shown to the
  -- admin in the preview, tau-security F3).
  update pg_temp.att_rows r set member_id = k.member_id, self_added = k.self_added
  from (
    select public.email_match_key(me.email::text) as key, me.member_id, false as self_added
    from public.member_emails me
    join public.members m on m.id = me.member_id and m.status = 'active'
    union
    select public.email_match_key(le.email::text), le.member_id, le.linked_by is not distinct from le.member_id
    from public.member_luma_emails le
    join public.members m on m.id = le.member_id and m.status = 'active'
  ) k
  where k.key = public.email_match_key(r.email::text);

  -- Non-members: counted once per email, never kept.
  select count(distinct r.email), count(distinct r.email) filter (where r.checked_in)
    into v_g_reg, v_g_in
  from pg_temp.att_rows r where r.member_id is null;
  -- ...and listed back to the admin's browser (which sent them) so they can be linked. Not stored.
  select coalesce(jsonb_agg(distinct r.email::text), '[]'::jsonb)
    into v_unmatched
  from pg_temp.att_rows r where r.member_id is null;

  -- One row per member, even if they registered with two of their emails.
  create temporary table if not exists pg_temp.att_members (
    member_id uuid primary key, status public.attendance_status, checked_in_at timestamptz, self_added boolean
  ) on commit drop;
  truncate pg_temp.att_members;
  insert into pg_temp.att_members
  select r.member_id,
         case when bool_or(r.checked_in) then 'checked_in'
              when v_ends < now() then 'no_show'
              else 'registered' end::public.attendance_status,
         min(r.checked_in_at),
         bool_or(r.self_added)
  from pg_temp.att_rows r where r.member_id is not null
  group by r.member_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', a.member_id, 'full_name', m.full_name, 'status', a.status, 'checked_in_at', a.checked_in_at,
           'self_added', a.self_added)
         order by a.status, m.full_name), '[]'::jsonb)
    into v_members
  from pg_temp.att_members a join public.members m on m.id = a.member_id;

  if p_commit then
    delete from public.attendance a where a.event_id = p_event_id;
    insert into public.attendance (event_id, member_id, status, checked_in_at, source, imported_by)
      select p_event_id, a.member_id, a.status, a.checked_in_at, 'luma_csv', v_admin from pg_temp.att_members a;
    insert into public.attendance_imports as i (event_id, rows_total, guests_registered, guests_checked_in, imported_at, imported_by)
      values (p_event_id, v_total, v_g_reg, v_g_in, now(), v_admin)
      on conflict (event_id) do update
        set rows_total = excluded.rows_total, guests_registered = excluded.guests_registered,
            guests_checked_in = excluded.guests_checked_in, imported_at = excluded.imported_at,
            imported_by = excluded.imported_by;
  end if;

  truncate pg_temp.att_rows;
  truncate pg_temp.att_members;
  return jsonb_build_object(
    'members', v_members, 'rows_total', v_total, 'ignored', v_ignored,
    'guests_registered', v_g_reg, 'guests_checked_in', v_g_in, 'committed', p_commit,
    'unmatched', v_unmatched);
end;
$$;

revoke all on function public.admin_import_attendance(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.admin_import_attendance(uuid, jsonb, boolean) to authenticated;

-- Which member already owns this mailbox (by match key, sign-in or Luma address), for the admin
-- link action: so a Gmail dot variant of another member's email is refused there too.
create or replace function public.admin_email_owner(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text := public.email_match_key(p_email);
begin
  perform public.assert_admin();
  return coalesce(
    (select e.member_id from public.member_emails e where public.email_match_key(e.email::text) = v_key limit 1),
    (select l.member_id from public.member_luma_emails l where public.email_match_key(l.email::text) = v_key limit 1));
end;
$$;

revoke all on function public.admin_email_owner(text) from public, anon, authenticated;
grant execute on function public.admin_email_owner(text) to authenticated;

-- ---- 4. a member adds their own Luma address (personal area) -------------------------------
-- The club asks members to register on Luma with their site email. A member who knows they use
-- another one can add it here, so their uploads match without an admin. Same table, same rule:
-- match only, never sign-in (email_on_club_list() and current_member_id() read member_emails
-- only). Refused when the address (by match key) already belongs to ANOTHER member, in either
-- table. At most 3 per member, 10 tries a day. A member sees and removes only their own rows (also the ones an
-- admin linked for them). No direct table access: these three functions are the only way in.
create or replace function public.my_luma_emails()
returns table (email text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.email::text, l.created_at
  from public.member_luma_emails l
  where l.member_id = public.current_member_id()
  order by l.created_at, l.email
$$;

-- Tries per member per Israeli day (tau-security F1): "added" vs "taken" tells whether an
-- address is some member's, so without a cap a script could test thousands of addresses against
-- the club list. Every call counts, refusals included, and removing an address frees nothing.
-- No one reads it directly (RLS on, no policy, no grants); add_my_luma_email() writes it.
create table public.member_luma_email_tries (
  member_id uuid not null references public.members (id) on delete cascade,
  day       date not null,
  n         int  not null default 0,
  primary key (member_id, day)
);
revoke all on public.member_luma_email_tries from public, anon, authenticated;
alter table public.member_luma_email_tries enable row level security;

-- Returns one word, never raises for a refusal (so the try is still counted; a raise would roll
-- it back): 'added'; 'exists' (already one of mine); 'own' (my sign-in email, which matches
-- anyway); 'taken' (another member's address); 'invalid'; 'limit' (3 already); 'tries' (10
-- tries today). Raises only for non-members.
create or replace function public.add_my_luma_email(p_email text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member uuid := public.current_member_id();
  v_email  text := lower(btrim(normalize(coalesce(p_email, ''), NFKC)));
  v_day    date := (now() at time zone 'Asia/Jerusalem')::date;
  v_tries  int;
  v_key    text;
begin
  if v_member is null then
    raise exception 'members only' using errcode = '42501';
  end if;

  -- Count this try first; refuse once today's 10 are used. Older days are dropped.
  delete from public.member_luma_email_tries t where t.member_id = v_member and t.day < v_day;
  insert into public.member_luma_email_tries as t (member_id, day, n) values (v_member, v_day, 1)
    on conflict (member_id, day) do update set n = t.n + 1
    returning t.n into v_tries;
  if v_tries > 10 then
    return 'tries';
  end if;

  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return 'invalid';
  end if;
  v_key := public.email_match_key(v_email);

  -- One member per mailbox, across both tables, by key (so a Gmail dot variant counts too).
  -- Serialised per key, so two members adding the same address at once can't both win.
  perform pg_advisory_xact_lock(hashtext('member_luma_emails:' || v_key));
  if exists (select 1 from public.member_emails e where public.email_match_key(e.email::text) = v_key and e.member_id <> v_member)
     or exists (select 1 from public.member_luma_emails l where public.email_match_key(l.email::text) = v_key and l.member_id <> v_member) then
    return 'taken';
  end if;
  if exists (select 1 from public.member_emails e where public.email_match_key(e.email::text) = v_key) then
    return 'own';
  end if;
  if exists (select 1 from public.member_luma_emails l where public.email_match_key(l.email::text) = v_key) then
    return 'exists';
  end if;
  if (select count(*) from public.member_luma_emails l where l.member_id = v_member) >= 3 then
    return 'limit';
  end if;

  insert into public.member_luma_emails (email, member_id, linked_by)
  values (v_email::extensions.citext, v_member, v_member);
  return 'added';
end;
$$;

create or replace function public.remove_my_luma_email(p_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member uuid := public.current_member_id();
  v_n      int;
begin
  if v_member is null then
    raise exception 'members only' using errcode = '42501';
  end if;
  delete from public.member_luma_emails l
  where l.member_id = v_member and l.email operator(extensions.=) btrim(coalesce(p_email, ''))::extensions.citext;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke all on function public.my_luma_emails(), public.add_my_luma_email(text), public.remove_my_luma_email(text)
  from public, anon, authenticated;
grant execute on function public.my_luma_emails(), public.add_my_luma_email(text), public.remove_my_luma_email(text)
  to authenticated;
