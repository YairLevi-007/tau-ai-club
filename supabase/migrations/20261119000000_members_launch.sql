-- Members launch: email-code log-in guard, profile program, and private member contact
-- details with per-field sharing.
--
-- Security model (adds to the M2 migrations):
--   * before_user_created auth hook: Supabase Auth only creates a user whose email is on the
--     allowlist (member_emails, active member). The app checks the list too before it asks
--     for a code; this is the database-level guard behind it.
--   * member_contacts (phone, contact email) has NO grants for anon/authenticated. Members
--     read it only through member_contact(), which returns a field only when its owner
--     turned sharing on (both default OFF). The owner always sees and edits their own row
--     through my_contact() / update_my_contact().
--   * Contact details are never in profiles (which every member can SELECT directly),
--     never in member_directory/member_profile, and never in fixtures.

-- ---------------------------------------------------------------------------
-- Profiles: degree / program
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column program text check (program is null or char_length(program) <= 160);
grant update (program) on public.profiles to authenticated;

-- member_profile() gains `program` (return type changes, so drop and recreate).
drop function public.member_profile(uuid);
create function public.member_profile(p_member_id uuid)
returns table (
  id uuid, full_name text, photo_url text, year smallint, faculty text, program text,
  bio_he text, bio_en text, links jsonb, is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.full_name, p.photo_url, p.year, p.faculty, p.program, p.bio_he, p.bio_en,
         coalesce(p.links, '{}'::jsonb), m.id = public.current_member_id()
  from public.members m
  left join public.profiles p on p.member_id = m.id
  where public.is_member() and m.status = 'active' and m.id = p_member_id
$$;

-- ---------------------------------------------------------------------------
-- Private member contact details
-- ---------------------------------------------------------------------------
create table public.member_contacts (
  member_id      uuid primary key references public.members (id) on delete cascade,
  phone          text check (phone is null or phone ~ '^\+?[0-9][0-9 ()-]{5,22}$'),
  contact_email  extensions.citext
                   check (contact_email is null
                          or (char_length(contact_email::text) <= 254 and contact_email::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  share_phone    boolean not null default false,
  share_email    boolean not null default false,
  updated_at     timestamptz not null default now()
);
create trigger member_contacts_updated_at before update on public.member_contacts
  for each row execute function public.set_updated_at();

revoke all on public.member_contacts from public, anon, authenticated;
alter table public.member_contacts enable row level security;
-- Defence in depth: even if a grant slips in later, only admins pass RLS.
create policy "admins only"
  on public.member_contacts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- The caller's own contact row (always one row for a member, with defaults if none yet).
create or replace function public.my_contact()
returns table (phone text, contact_email text, share_phone boolean, share_email boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.phone, c.contact_email::text, coalesce(c.share_phone, false), coalesce(c.share_email, false)
  from (select public.current_member_id() as id) me
  left join public.member_contacts c on c.member_id = me.id
  where me.id is not null
$$;

-- The caller edits their own contact details and sharing toggles.
create or replace function public.update_my_contact(
  p_phone text, p_contact_email text, p_share_phone boolean, p_share_email boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member uuid := public.current_member_id();
  v_phone  text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email  text := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
begin
  if v_member is null then
    raise exception 'members only' using errcode = '42501';
  end if;
  insert into public.member_contacts as c (member_id, phone, contact_email, share_phone, share_email)
  values (v_member, v_phone, v_email::extensions.citext, coalesce(p_share_phone, false), coalesce(p_share_email, false))
  on conflict (member_id) do update set
    phone = excluded.phone, contact_email = excluded.contact_email,
    share_phone = excluded.share_phone, share_email = excluded.share_email;
end;
$$;

-- Another member's contact details, for members only, and only the fields they share.
-- A member always sees their own. Guests and non-members get no rows.
create or replace function public.member_contact(p_member_id uuid)
returns table (phone text, contact_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when c.share_phone or c.member_id = public.current_member_id() then c.phone end,
    case when c.share_email or c.member_id = public.current_member_id() then c.contact_email::text end
  from public.member_contacts c
  join public.members m on m.id = c.member_id
  where public.is_member() and m.status = 'active' and c.member_id = p_member_id
$$;

-- ---------------------------------------------------------------------------
-- Auth hook: only allowlisted emails become users
-- ---------------------------------------------------------------------------
-- Supabase → Authentication → Hooks → "Before User Created" → Postgres function
-- public.hook_before_user_created. Event shape: { "user": { "email": ... }, ... }.
-- Return {} to allow, or { "error": { "http_code", "message" } } to reject.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if v_email <> '' and exists (
    select 1
    from public.member_emails me
    join public.members m on m.id = me.member_id
    where me.email operator(extensions.=) v_email::extensions.citext
      and m.status = 'active'
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'This email is not on the club list.')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function
  public.member_profile(uuid), public.my_contact(),
  public.update_my_contact(text, text, boolean, boolean), public.member_contact(uuid),
  public.hook_before_user_created(jsonb)
  from public, anon, authenticated;

grant execute on function
  public.member_profile(uuid), public.my_contact(),
  public.update_my_contact(text, text, boolean, boolean), public.member_contact(uuid)
  to authenticated;

-- Only Supabase Auth calls the hook.
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
