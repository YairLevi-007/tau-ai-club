-- Two Luma uploads per session (DECISIONS 25.11).
--
-- Before the session the admin uploads who registered (it feeds the pAIr round); after the
-- session they upload again who actually came. admin_import_attendance() already tells the two
-- apart by time: before the session ends, going-but-not-checked-in is 'registered'; after it
-- ends, 'no_show'. That logic is unchanged. This only remembers WHEN each of the two uploads
-- happened, so the admin can see per session which one is done.
--
--   * attendance_imports.before_imported_at  the last upload saved before the session ended
--   * attendance_imports.after_imported_at   the last upload saved after it ended
--
-- A trigger fills them from imported_at, by the same rule (imported_at >= the event's ends_at
-- means "after"). No new grants: the table stays read-only for admins, written only by the
-- import function.

alter table public.attendance_imports
  add column before_imported_at timestamptz,
  add column after_imported_at  timestamptz;

-- Existing imports: put each one on its side of the session's end.
update public.attendance_imports i
   set before_imported_at = case when i.imported_at <  e.ends_at then i.imported_at end,
       after_imported_at  = case when i.imported_at >= e.ends_at then i.imported_at end
  from public.events e
 where e.id = i.event_id;

create or replace function public.attendance_imports_phase()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ends timestamptz;
begin
  select e.ends_at into v_ends from public.events e where e.id = new.event_id;
  -- An upload stamps only its own phase; the other one keeps what it had.
  if tg_op = 'UPDATE' then
    new.before_imported_at := old.before_imported_at;
    new.after_imported_at  := old.after_imported_at;
  else
    new.before_imported_at := null;
    new.after_imported_at  := null;
  end if;
  if v_ends is not null and new.imported_at >= v_ends then
    new.after_imported_at := new.imported_at;
  else
    new.before_imported_at := new.imported_at;
  end if;
  return new;
end;
$$;

revoke all on function public.attendance_imports_phase() from public, anon, authenticated;

create trigger attendance_imports_phase
  before insert or update on public.attendance_imports
  for each row execute function public.attendance_imports_phase();
