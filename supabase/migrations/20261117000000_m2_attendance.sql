-- Milestone 2: attendance, from Luma's free guest export.
--
-- At the door the club checks guests in with the Luma app. After the event an admin exports
-- the guest list (Luma → event → Guests → Export CSV) and uploads it on the event's admin
-- page. The browser reads the CSV and sends only email + going + check-in time; this RPC
-- matches the emails to members (any of their emails) and stores one row per member.
--
-- Guests who aren't members are NEVER stored: no name, no email, nothing. Only how many
-- there were (attendance_imports), so the club can see its reach.
--
--   * attendance          one row per (event, member). Admins read/write; a member reads
--                         only their own rows; guests nothing.
--   * attendance_imports  one row per event: when it was imported, by whom, guest counts.
--                         Admins only.
--   * admin_import_attendance(event, rows, commit) previews (commit = false) or replaces
--                         the event's attendance (commit = true), in one transaction.

create type public.attendance_status as enum ('registered', 'checked_in', 'no_show');

create table public.attendance (
  event_id      uuid not null references public.events (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  status        public.attendance_status not null,
  checked_in_at timestamptz check (checked_in_at is null or status = 'checked_in'),
  source        text not null default 'luma_csv' check (source in ('luma_csv')),
  imported_at   timestamptz not null default now(),
  imported_by   uuid references public.members (id) on delete set null,
  primary key (event_id, member_id)
);
create index attendance_member_idx on public.attendance (member_id);

create table public.attendance_imports (
  event_id           uuid primary key references public.events (id) on delete cascade,
  rows_total         int not null check (rows_total >= 0),
  guests_registered  int not null check (guests_registered >= 0),
  guests_checked_in  int not null check (guests_checked_in >= 0 and guests_checked_in <= guests_registered),
  source             text not null default 'luma_csv' check (source in ('luma_csv')),
  imported_at        timestamptz not null default now(),
  imported_by        uuid references public.members (id) on delete set null
);

-- Reads only; every write goes through admin_import_attendance().
revoke all on public.attendance, public.attendance_imports from public, anon, authenticated;
grant select on public.attendance, public.attendance_imports to authenticated;

alter table public.attendance         enable row level security;
alter table public.attendance_imports enable row level security;

create policy "admins read all attendance"
  on public.attendance for select to authenticated
  using ((select public.is_admin()));
create policy "members read their own attendance"
  on public.attendance for select to authenticated
  using (member_id = (select public.current_member_id()));
create policy "admins read attendance imports"
  on public.attendance_imports for select to authenticated
  using ((select public.is_admin()));

-- p_rows: [{"email": "...", "going": true|false, "checked_in": true|false,
--           "checked_in_at": "<ISO timestamp>" | null}, ...]  (max 5000)
-- going = registered and approved on Luma. A row neither going nor checked in (declined,
-- waitlist, pending) is ignored. A checked-in member counts as attended either way.
-- After the event has ended, going-but-not-checked-in is a no-show; before, registered.
-- Returns {members: [{member_id, full_name, status, checked_in_at}], rows_total, ignored,
--          guests_registered, guests_checked_in, committed}.
create or replace function public.admin_import_attendance(p_event_id uuid, p_rows jsonb, p_commit boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ends    timestamptz;
  v_admin   uuid := public.current_member_id();
  v_members jsonb;
  v_total   int;
  v_ignored int;
  v_g_reg   int;
  v_g_in    int;
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
    email extensions.citext, going boolean, checked_in boolean, checked_in_at timestamptz, member_id uuid
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

  update pg_temp.att_rows r set member_id = me.member_id
  from public.member_emails me
  join public.members m on m.id = me.member_id and m.status = 'active'
  where me.email operator(extensions.=) r.email;

  -- Non-members: counted once per email, never kept.
  select count(distinct r.email), count(distinct r.email) filter (where r.checked_in)
    into v_g_reg, v_g_in
  from pg_temp.att_rows r where r.member_id is null;

  -- One row per member, even if they registered with two of their emails.
  create temporary table if not exists pg_temp.att_members (
    member_id uuid primary key, status public.attendance_status, checked_in_at timestamptz
  ) on commit drop;
  truncate pg_temp.att_members;
  insert into pg_temp.att_members
  select r.member_id,
         case when bool_or(r.checked_in) then 'checked_in'
              when v_ends < now() then 'no_show'
              else 'registered' end::public.attendance_status,
         min(r.checked_in_at)
  from pg_temp.att_rows r where r.member_id is not null
  group by r.member_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', a.member_id, 'full_name', m.full_name, 'status', a.status, 'checked_in_at', a.checked_in_at)
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
    'guests_registered', v_g_reg, 'guests_checked_in', v_g_in, 'committed', p_commit);
end;
$$;

revoke all on function public.admin_import_attendance(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.admin_import_attendance(uuid, jsonb, boolean) to authenticated;
