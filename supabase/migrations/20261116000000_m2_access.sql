-- Milestone 2: members, allowlist, roles, profiles, speaker contact data + RLS.
-- Source of truth for the design: docs/PLAN.md §2 ("People and access", "Speaker contact").
--
-- Security model:
--   * The club is closed. A signed-in user is a member only if their VERIFIED email
--     (JWT `email`, confirmed in auth.users) is on the allowlist (member_emails).
--     A non-allowlisted user has a session, but is_member() is false and RLS returns nothing.
--   * Admins (members.role = 'admin') can write content and manage the allowlist.
--   * speaker_contacts and speaker_form_tokens have NO grants for anon/authenticated.
--     Everything goes through security-definer RPCs that check the caller.
--   * members.status ('active') is what lets next year's join flow add 'pending'
--     plus an applications table without a rewrite.
--
-- Every function is `set search_path = ''` and fully qualifies names. citext lives in the
-- `extensions` schema (Supabase default), so citext comparisons inside functions use
-- `operator(extensions.=)`: with an empty search_path a bare `=` would silently fall back
-- to case-sensitive text equality.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('member', 'admin');
-- Join flow next year: `alter type public.member_status add value 'pending';`
create type public.member_status as enum ('active');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.members (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 120),
  role        public.member_role not null default 'member',
  status      public.member_status not null default 'active',
  cohort_id   uuid references public.cohorts (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The allowlist. citext: Foo@Gmail.com and foo@gmail.com are the same entry.
create table public.member_emails (
  email       extensions.citext primary key
                check (char_length(email::text) <= 254 and email::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  member_id   uuid not null references public.members (id) on delete cascade,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index member_emails_member_idx on public.member_emails (member_id);
create unique index member_emails_one_primary on public.member_emails (member_id) where is_primary;

-- Created on first sign-in by claim_membership(). The profile page itself is built later.
create table public.profiles (
  member_id     uuid primary key references public.members (id) on delete cascade,
  auth_user_id  uuid references auth.users (id) on delete set null,
  photo_url     text check (photo_url is null or photo_url ~ '^https://'),
  year          smallint check (year is null or year between 1 and 10),
  faculty       text check (faculty is null or char_length(faculty) <= 120),
  bio_he        text check (bio_he is null or char_length(bio_he) <= 2000),
  bio_en        text check (bio_en is null or char_length(bio_en) <= 2000),
  links         jsonb not null default '{}'::jsonb check (jsonb_typeof(links) = 'object'),
  welcomed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index profiles_auth_user_idx on public.profiles (auth_user_id);

-- Private speaker contact data. Only consented fields are ever stored (see the checks).
create table public.speaker_contacts (
  speaker_id       uuid primary key references public.speakers (id) on delete cascade,
  email            extensions.citext
                     check (email is null or (char_length(email::text) <= 254 and email::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone            text check (phone is null or phone ~ '^\+?[0-9][0-9 ()-]{5,22}$'),
  linkedin_url     text check (linkedin_url is null or (char_length(linkedin_url) <= 200
                     and linkedin_url ~ '^https://([a-z]{2,3}\.)?linkedin\.com/[A-Za-z0-9_/%.-]+$')),
  share_email      boolean not null default false,
  share_phone      boolean not null default false,
  share_linkedin   boolean not null default false,
  linkedin_public  boolean not null default false,
  consented_at     timestamptz not null,
  updated_at       timestamptz not null default now(),
  -- A field is stored only if the speaker consented to share it.
  check (share_email    or email is null),
  check (share_phone    or phone is null),
  check (share_linkedin or linkedin_url is null),
  -- Public LinkedIn needs LinkedIn sharing in the first place.
  check (not linkedin_public or share_linkedin)
);

-- Single-use links. Only the SHA-256 of the token is stored; the raw token is shown once.
create table public.speaker_form_tokens (
  id          uuid primary key default gen_random_uuid(),
  token_hash  bytea not null unique,
  speaker_id  uuid not null references public.speakers (id) on delete cascade,
  created_by  uuid references public.members (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  check (expires_at > created_at)
);
create index speaker_form_tokens_speaker_idx on public.speaker_form_tokens (speaker_id);

create trigger members_updated_at          before update on public.members          for each row execute function public.set_updated_at();
create trigger profiles_updated_at         before update on public.profiles         for each row execute function public.set_updated_at();
create trigger speaker_contacts_updated_at before update on public.speaker_contacts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Identity helpers (security definer: they read the allowlist, which callers can't)
-- ---------------------------------------------------------------------------

-- The caller's email, only if it is VERIFIED: it must be in the JWT and confirmed in
-- auth.users (Google sign-in confirms it). user_metadata is never trusted, because users
-- can edit it. Anonymous sign-ins never count.
create or replace function public.verified_email()
returns extensions.citext
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::extensions.citext
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and lower(u.email) = lower(auth.jwt() ->> 'email')
$$;

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.member_emails me
  join public.members m on m.id = me.member_id
  where me.email operator(extensions.=) public.verified_email()
    and m.status = 'active'
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_member_id() is not null
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.id = public.current_member_id() and m.role = 'admin'
  )
$$;

-- The caller's own membership (no other member's data). Empty for non-members.
create or replace function public.current_member()
returns table (id uuid, full_name text, role public.member_role, welcomed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.full_name, m.role, p.welcomed_at
  from public.members m
  left join public.profiles p on p.member_id = m.id
  where m.id = public.current_member_id()
$$;

-- Called once after sign-in. Creates/links the caller's profile and reports whether this
-- is the first login (for the welcome screen). Non-members get no rows.
create or replace function public.claim_membership()
returns table (full_name text, role public.member_role, first_login boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member uuid := public.current_member_id();
  v_first  boolean;
begin
  if v_member is null then
    return;
  end if;

  select p.welcomed_at is null into v_first from public.profiles p where p.member_id = v_member;
  v_first := coalesce(v_first, true);

  insert into public.profiles as p (member_id, auth_user_id, welcomed_at)
  values (v_member, auth.uid(), now())
  on conflict (member_id) do update
    set auth_user_id = excluded.auth_user_id,
        welcomed_at  = coalesce(p.welcomed_at, excluded.welcomed_at);

  return query
    select m.full_name, m.role, v_first from public.members m where m.id = v_member;
end;
$$;

-- Never leave the club without an admin (demoting or removing the last one).
create or replace function public.keep_one_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active')
     and not exists (
       select 1 from public.members m
       where m.role = 'admin' and m.status = 'active' and m.id <> old.id
     ) then
    raise exception 'cannot remove or demote the last admin' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger members_keep_one_admin
  before update of role, status or delete on public.members
  for each row execute function public.keep_one_admin();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Supabase grants everything to anon/authenticated by default. Start from nothing.
revoke all on public.members, public.member_emails, public.profiles,
              public.speaker_contacts, public.speaker_form_tokens
  from public, anon, authenticated;

-- Allowlist: admins only (through RLS below).
grant select, insert, update, delete on public.members, public.member_emails to authenticated;

-- Profiles: members read; members edit only their own content columns (never member_id,
-- auth_user_id or welcomed_at); admins can delete. Rows are created by claim_membership().
grant select, delete on public.profiles to authenticated;
grant update (photo_url, year, faculty, bio_he, bio_en, links) on public.profiles to authenticated;

-- speaker_contacts / speaker_form_tokens: no grants at all. RPCs only.

-- Content tables: admins may now write (M1 was service-role only).
grant insert, update, delete on public.cohorts, public.venues, public.speakers, public.events, public.event_speakers
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.members             enable row level security;
alter table public.member_emails       enable row level security;
alter table public.profiles            enable row level security;
alter table public.speaker_contacts    enable row level security;
alter table public.speaker_form_tokens enable row level security;

-- `(select public.is_admin())` is evaluated once per statement, not per row.
create policy "admins manage members"
  on public.members for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins manage the allowlist"
  on public.member_emails for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "members read profiles"
  on public.profiles for select to authenticated
  using ((select public.is_member()));

create policy "members edit their own profile"
  on public.profiles for update to authenticated
  using (member_id = (select public.current_member_id()))
  with check (member_id = (select public.current_member_id()));

create policy "admins edit any profile"
  on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins delete profiles"
  on public.profiles for delete to authenticated
  using ((select public.is_admin()));

-- Defence in depth: even if a grant slips in later, only admins pass RLS.
create policy "admins only"
  on public.speaker_contacts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins only"
  on public.speaker_form_tokens for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Content: admins see drafts and write; everyone else keeps the M1 read-published policies.
create policy "admins manage cohorts"        on public.cohorts        for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage venues"         on public.venues         for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage speakers"       on public.speakers       for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage events"         on public.events         for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage line-ups"       on public.event_speakers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Admin RPCs: allowlist
-- ---------------------------------------------------------------------------
create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
end;
$$;

-- Add one member with a primary email. Fails if the email is already on the list.
create or replace function public.admin_add_member(p_email text, p_full_name text, p_role public.member_role default 'member')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.assert_admin();
  insert into public.members (full_name, role) values (btrim(p_full_name), coalesce(p_role, 'member'))
    returning id into v_id;
  insert into public.member_emails (email, member_id, is_primary)
    values (lower(btrim(p_email))::extensions.citext, v_id, true);
  return v_id;
end;
$$;

-- CSV import: rows = [{"email": "...", "full_name": "...", "role": "member|admin"}, ...].
-- Upserts by email: a known email updates that member's name/role; a new one creates a member.
-- All or nothing: one bad row aborts the whole import with the row number in the message.
create or replace function public.admin_import_members(p_rows jsonb)
returns table (inserted int, updated int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r        jsonb;
  i        int := 0;
  v_email  text;
  v_name   text;
  v_role   text;
  v_member uuid;
  n_ins    int := 0;
  n_upd    int := 0;
begin
  perform public.assert_admin();
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'too many rows (max 2000)' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_email := lower(btrim(coalesce(r ->> 'email', '')));
    v_name  := btrim(coalesce(r ->> 'full_name', ''));
    v_role  := lower(btrim(coalesce(nullif(r ->> 'role', ''), 'member')));

    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'row %: invalid email', i using errcode = '22023';
    end if;
    if v_role not in ('member', 'admin') then
      raise exception 'row %: role must be member or admin', i using errcode = '22023';
    end if;

    select me.member_id into v_member
    from public.member_emails me where me.email operator(extensions.=) v_email::extensions.citext;

    if v_member is null then
      if v_name = '' then
        raise exception 'row %: full_name is required for a new member', i using errcode = '22023';
      end if;
      insert into public.members (full_name, role) values (v_name, v_role::public.member_role)
        returning id into v_member;
      insert into public.member_emails (email, member_id, is_primary)
        values (v_email::extensions.citext, v_member, true);
      n_ins := n_ins + 1;
    else
      update public.members m
        set full_name = coalesce(nullif(v_name, ''), m.full_name),
            role      = v_role::public.member_role
        where m.id = v_member;
      n_upd := n_upd + 1;
    end if;
  end loop;

  return query select n_ins, n_upd;
end;
$$;

-- ---------------------------------------------------------------------------
-- Speaker contact RPCs
-- ---------------------------------------------------------------------------
-- Is this speaker publicly visible (on at least one published event)?
create or replace function public.speaker_is_public(p_speaker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_speakers es
    join public.events e on e.id = es.event_id
    where es.speaker_id = p_speaker_id and e.status = 'published'
  )
$$;

-- Public: LinkedIn only, only if the speaker opted in to sharing AND to it being public.
create or replace function public.public_speaker_links(p_speaker_id uuid)
returns table (linkedin_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.linkedin_url
  from public.speaker_contacts c
  where c.speaker_id = p_speaker_id
    and c.share_linkedin and c.linkedin_public
    and c.linkedin_url is not null
    and public.speaker_is_public(p_speaker_id)
$$;

-- Members: only the fields the speaker consented to share. Nothing for non-members.
create or replace function public.member_speaker_contact(p_speaker_id uuid)
returns table (email text, phone text, linkedin_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when c.share_email    then c.email::text end,
    case when c.share_phone    then c.phone end,
    case when c.share_linkedin then c.linkedin_url end
  from public.speaker_contacts c
  where c.speaker_id = p_speaker_id
    and public.is_member()
$$;

-- Admin: create a single-use link. Returns the raw token ONCE; only its hash is stored.
-- Any older unused link for the same speaker is invalidated.
create or replace function public.admin_create_speaker_token(p_speaker_id uuid, p_valid_days int default 14)
returns table (token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token   text;
  v_expires timestamptz;
begin
  perform public.assert_admin();
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 60 then
    raise exception 'valid days must be between 1 and 60' using errcode = '22023';
  end if;
  if not exists (select 1 from public.speakers s where s.id = p_speaker_id) then
    raise exception 'unknown speaker' using errcode = '22023';
  end if;

  -- 2 × gen_random_uuid() = 244 random bits from the OS CSPRNG, 64 hex chars.
  v_token   := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(days => p_valid_days);

  update public.speaker_form_tokens t set used_at = now()
    where t.speaker_id = p_speaker_id and t.used_at is null;

  insert into public.speaker_form_tokens (token_hash, speaker_id, created_by, expires_at)
    values (sha256(convert_to(v_token, 'UTF8')), p_speaker_id, public.current_member_id(), v_expires);

  return query select v_token, v_expires;
end;
$$;

create or replace function public.admin_revoke_speaker_tokens(p_speaker_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  update public.speaker_form_tokens t set used_at = now()
    where t.speaker_id = p_speaker_id and t.used_at is null;
end;
$$;

-- Admin: hard-delete a speaker's contact data (the speaker asked, or the club decided).
create or replace function public.admin_delete_speaker_contact(p_speaker_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  delete from public.speaker_contacts c where c.speaker_id = p_speaker_id;
end;
$$;

-- Admin overview: which fields each speaker shared, and their open link. No contact VALUES.
create or replace function public.admin_speaker_contact_status()
returns table (
  speaker_id uuid, slug text, name_he text, name_en text,
  has_contact boolean, has_email boolean, has_phone boolean, has_linkedin boolean,
  linkedin_public boolean, consented_at timestamptz, link_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
    select s.id, s.slug, s.name_he, s.name_en,
           c.speaker_id is not null,
           coalesce(c.email is not null, false),
           coalesce(c.phone is not null, false),
           coalesce(c.linkedin_url is not null, false),
           coalesce(c.linkedin_public, false),
           c.consented_at,
           (select max(t.expires_at) from public.speaker_form_tokens t
             where t.speaker_id = s.id and t.used_at is null and t.expires_at > now())
    from public.speakers s
    left join public.speaker_contacts c on c.speaker_id = s.id
    order by s.name_en;
end;
$$;

-- Speaker form: what the page needs to render (the speaker's name). Valid links only.
create or replace function public.speaker_form_info(p_token text)
returns table (name_he text, name_en text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name_he, s.name_en, t.expires_at
  from public.speaker_form_tokens t
  join public.speakers s on s.id = t.speaker_id
  where p_token is not null and char_length(p_token) = 64
    and t.token_hash = sha256(convert_to(p_token, 'UTF8'))
    and t.used_at is null
    and t.expires_at > now()
$$;

-- Speaker form submission. Checks the token (hash, unused, not expired), requires explicit
-- consent, stores ONLY the consented fields with consented_at = now(), and burns the token.
-- Replaces any earlier data for that speaker.
create or replace function public.submit_speaker_contact(
  p_token           text,
  p_consent         boolean,
  p_share_email     boolean,
  p_email           text,
  p_share_phone     boolean,
  p_phone           text,
  p_share_linkedin  boolean,
  p_linkedin_url    text,
  p_linkedin_public boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tok   public.speaker_form_tokens%rowtype;
  v_email text := case when coalesce(p_share_email, false)    then nullif(lower(btrim(p_email)), '') end;
  v_phone text := case when coalesce(p_share_phone, false)    then nullif(btrim(p_phone), '') end;
  v_li    text := case when coalesce(p_share_linkedin, false) then nullif(btrim(p_linkedin_url), '') end;
begin
  if p_token is null or char_length(p_token) <> 64 then
    raise exception 'invalid or expired link' using errcode = '28000';
  end if;

  select * into v_tok from public.speaker_form_tokens t
    where t.token_hash = sha256(convert_to(p_token, 'UTF8'))
    for update;

  if not found or v_tok.used_at is not null or v_tok.expires_at <= now() then
    raise exception 'invalid or expired link' using errcode = '28000';
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'consent is required' using errcode = '22023';
  end if;
  if coalesce(p_share_email, false) and v_email is null
     or coalesce(p_share_phone, false) and v_phone is null
     or coalesce(p_share_linkedin, false) and v_li is null then
    raise exception 'a shared field is empty' using errcode = '22023';
  end if;

  insert into public.speaker_contacts as c (
    speaker_id, email, phone, linkedin_url,
    share_email, share_phone, share_linkedin, linkedin_public, consented_at
  ) values (
    v_tok.speaker_id, v_email::extensions.citext, v_phone, v_li,
    v_email is not null, v_phone is not null, v_li is not null,
    v_li is not null and coalesce(p_linkedin_public, false), now()
  )
  on conflict (speaker_id) do update set
    email = excluded.email, phone = excluded.phone, linkedin_url = excluded.linkedin_url,
    share_email = excluded.share_email, share_phone = excluded.share_phone,
    share_linkedin = excluded.share_linkedin, linkedin_public = excluded.linkedin_public,
    consented_at = excluded.consented_at;

  update public.speaker_form_tokens t set used_at = now() where t.id = v_tok.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges. Postgres grants EXECUTE to PUBLIC by default and Supabase grants it
-- to anon/authenticated, so revoke everything and grant back only what each role needs.
-- ---------------------------------------------------------------------------
revoke all on function
  public.verified_email(), public.current_member_id(), public.is_member(), public.is_admin(),
  public.current_member(), public.claim_membership(), public.keep_one_admin(), public.assert_admin(),
  public.admin_add_member(text, text, public.member_role), public.admin_import_members(jsonb),
  public.speaker_is_public(uuid), public.public_speaker_links(uuid), public.member_speaker_contact(uuid),
  public.admin_create_speaker_token(uuid, int), public.admin_revoke_speaker_tokens(uuid),
  public.admin_delete_speaker_contact(uuid), public.admin_speaker_contact_status(),
  public.speaker_form_info(text),
  public.submit_speaker_contact(text, boolean, boolean, text, boolean, text, boolean, text, boolean)
  from public, anon, authenticated;

-- Used inside RLS policies, so every API role must be able to call them (they only ever
-- describe the caller).
grant execute on function public.current_member_id(), public.is_member(), public.is_admin()
  to anon, authenticated;

grant execute on function public.current_member(), public.claim_membership(),
  public.member_speaker_contact(uuid),
  public.admin_add_member(text, text, public.member_role), public.admin_import_members(jsonb),
  public.admin_create_speaker_token(uuid, int), public.admin_revoke_speaker_tokens(uuid),
  public.admin_delete_speaker_contact(uuid), public.admin_speaker_contact_status()
  to authenticated;

grant execute on function public.public_speaker_links(uuid), public.speaker_form_info(text),
  public.submit_speaker_contact(text, boolean, boolean, text, boolean, text, boolean, text, boolean)
  to anon, authenticated;
