-- What each of a session's two Luma uploads brought in (25.11), so the admin can check it against
-- Luma. attendance_imports keeps only the LAST upload's totals, and the after-upload replaces the
-- event's attendance rows, so the before-upload's numbers were lost. Each upload now also stamps
-- its own counts on its own side:
--
--   before_rows_total        people in the before file (every row, as rows_total)
--   before_members           members registered by it (their attendance rows)
--   before_guests            non-member guests going (guests_registered)
--   after_rows_total         people in the after file
--   after_members_checked_in members checked in
--   after_no_shows           members registered who didn't come
--   after_guests_checked_in  non-member guests checked in (guests_checked_in)
--
-- Counts only: no names, no emails. The import function and its statuses are unchanged: it
-- writes the event's attendance rows and then its attendance_imports row, and the existing
-- BEFORE trigger (migration 20261125000000) now also counts those rows. The trigger runs as the
-- import function's owner, the only writer of this table. No new grants: the table stays readable
-- by admins only (its existing RLS), and its new columns with it.

alter table public.attendance_imports
  add column before_rows_total        int,
  add column before_members           int,
  add column before_guests            int,
  add column after_rows_total         int,
  add column after_members_checked_in int,
  add column after_no_shows           int,
  add column after_guests_checked_in  int;

create or replace function public.attendance_imports_phase()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ends timestamptz;
  v_registered int;
  v_checked_in int;
  v_no_show int;
begin
  select e.ends_at into v_ends from public.events e where e.id = new.event_id;
  select count(*),
         count(*) filter (where a.status = 'checked_in'),
         count(*) filter (where a.status = 'no_show')
    into v_registered, v_checked_in, v_no_show
  from public.attendance a where a.event_id = new.event_id;

  -- An upload stamps only its own phase; the other one keeps what it had.
  if tg_op = 'UPDATE' then
    new.before_imported_at := old.before_imported_at;
    new.after_imported_at  := old.after_imported_at;
    new.before_rows_total := old.before_rows_total;
    new.before_members := old.before_members;
    new.before_guests := old.before_guests;
    new.after_rows_total := old.after_rows_total;
    new.after_members_checked_in := old.after_members_checked_in;
    new.after_no_shows := old.after_no_shows;
    new.after_guests_checked_in := old.after_guests_checked_in;
  else
    new.before_imported_at := null;
    new.after_imported_at  := null;
    new.before_rows_total := null;
    new.before_members := null;
    new.before_guests := null;
    new.after_rows_total := null;
    new.after_members_checked_in := null;
    new.after_no_shows := null;
    new.after_guests_checked_in := null;
  end if;

  if v_ends is not null and new.imported_at >= v_ends then
    new.after_imported_at := new.imported_at;
    new.after_rows_total := new.rows_total;
    new.after_members_checked_in := v_checked_in;
    new.after_no_shows := v_no_show;
    new.after_guests_checked_in := new.guests_checked_in;
  else
    new.before_imported_at := new.imported_at;
    new.before_rows_total := new.rows_total;
    new.before_members := v_registered;
    new.before_guests := new.guests_registered;
  end if;
  return new;
end;
$$;

revoke all on function public.attendance_imports_phase() from public, anon, authenticated;

-- Existing imports: only the last upload's rows are still there, so fill only that upload's side.
-- (Where an after-upload already replaced a before-upload, the before numbers are gone.)
-- Session 3's before-upload, for one, gets its numbers back here.
alter table public.attendance_imports disable trigger attendance_imports_phase;
update public.attendance_imports i
   set before_rows_total = case when i.before_imported_at = i.imported_at then i.rows_total end,
       before_members    = case when i.before_imported_at = i.imported_at then c.registered end,
       before_guests     = case when i.before_imported_at = i.imported_at then i.guests_registered end,
       after_rows_total         = case when i.after_imported_at = i.imported_at then i.rows_total end,
       after_members_checked_in = case when i.after_imported_at = i.imported_at then c.checked_in end,
       after_no_shows           = case when i.after_imported_at = i.imported_at then c.no_show end,
       after_guests_checked_in  = case when i.after_imported_at = i.imported_at then i.guests_checked_in end
  from (
    select i2.event_id,
           (select count(*) from public.attendance a where a.event_id = i2.event_id)::int as registered,
           (select count(*) from public.attendance a where a.event_id = i2.event_id and a.status = 'checked_in')::int as checked_in,
           (select count(*) from public.attendance a where a.event_id = i2.event_id and a.status = 'no_show')::int as no_show
    from public.attendance_imports i2
  ) c
 where c.event_id = i.event_id;
alter table public.attendance_imports enable trigger attendance_imports_phase;
