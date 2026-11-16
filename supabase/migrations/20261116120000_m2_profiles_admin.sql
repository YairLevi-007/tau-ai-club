-- Milestone 2, part 2: member profiles (with photos in Storage), the member directory,
-- and an atomic admin "save event" RPC.
--
-- Security model (adds to 20261116000000_m2_access.sql):
--   * Profile photos live in the PRIVATE Storage bucket `avatars`, one folder per member:
--     avatars/<member_id>/<file>. Members can read every photo; each member can write
--     only their own folder; admins can delete any photo. Guests and non-members: nothing.
--   * members.full_name stays admin-managed for everyone else, but a member can change
--     their OWN name through update_my_name().
--   * The member directory (names + profiles) is readable by members only, through
--     security-definer RPCs, because members/member_emails stay admin-only tables.
--   * admin_save_event() writes an event and its line-up in one transaction.

-- ---------------------------------------------------------------------------
-- Storage: avatars bucket + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- First path segment of an object name, e.g. '<member_id>' for '<member_id>/photo.jpg'.
create or replace function public.avatar_owner_folder(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(split_part(p_name, '/', 1), '')
$$;

create policy "members read avatars"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (select public.is_member()));

create policy "members upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.avatar_owner_folder(name) = (select public.current_member_id())::text
  );

create policy "members replace their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and public.avatar_owner_folder(name) = (select public.current_member_id())::text
  )
  with check (
    bucket_id = 'avatars'
    and public.avatar_owner_folder(name) = (select public.current_member_id())::text
  );

create policy "members delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.avatar_owner_folder(name) = (select public.current_member_id())::text
      or (select public.is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- Profiles: photos must point at the caller's own folder in the avatars bucket
-- ---------------------------------------------------------------------------
-- photo_url holds the canonical (authenticated) object URL:
--   https://<ref>.supabase.co/storage/v1/object/authenticated/avatars/<member_id>/<file>
-- Pages turn it into a short-lived signed URL at render time.
alter table public.profiles
  add constraint profiles_photo_in_own_folder check (
    photo_url is null
    or photo_url ~ ('/storage/v1/object/authenticated/avatars/' || member_id::text || '/[A-Za-z0-9._-]+$')
  );

-- Links: only known keys, only https URLs, short.
alter table public.profiles
  add constraint profiles_links_shape check (
    (links - array['linkedin', 'github', 'website']) = '{}'::jsonb
    and coalesce((links ->> 'linkedin') ~ '^https://([a-z]{2,3}\.)?linkedin\.com/[A-Za-z0-9_/%.-]+$', true)
    and coalesce((links ->> 'github')   ~ '^https://github\.com/[A-Za-z0-9_.-]+/?$', true)
    and coalesce((links ->> 'website')  ~ '^https://[^\s]{4,200}$', true)
  );

-- ---------------------------------------------------------------------------
-- Member RPCs
-- ---------------------------------------------------------------------------
-- A member changes their own display name.
create or replace function public.update_my_name(p_full_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member uuid := public.current_member_id();
  v_name   text := btrim(coalesce(p_full_name, ''));
begin
  if v_member is null then
    raise exception 'members only' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'name must be 1-120 characters' using errcode = '22023';
  end if;
  update public.members m set full_name = v_name where m.id = v_member;
end;
$$;

-- Members-only directory. Empty for everyone else.
create or replace function public.member_directory()
returns table (id uuid, full_name text, photo_url text, year smallint, faculty text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.full_name, p.photo_url, p.year, p.faculty
  from public.members m
  left join public.profiles p on p.member_id = m.id
  where public.is_member() and m.status = 'active'
  order by m.full_name
$$;

-- One member's profile, for members only. No emails, no role.
create or replace function public.member_profile(p_member_id uuid)
returns table (
  id uuid, full_name text, photo_url text, year smallint, faculty text,
  bio_he text, bio_en text, links jsonb, is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.full_name, p.photo_url, p.year, p.faculty, p.bio_he, p.bio_en,
         coalesce(p.links, '{}'::jsonb), m.id = public.current_member_id()
  from public.members m
  left join public.profiles p on p.member_id = m.id
  where public.is_member() and m.status = 'active' and m.id = p_member_id
$$;

-- ---------------------------------------------------------------------------
-- Admin RPC: save an event and its line-up atomically
-- ---------------------------------------------------------------------------
-- p = { id?, slug, cohort_id, kind, series?, series_no?, title_he, title_en, blurb_he?, blurb_en?,
--       starts_at, ends_at, venue_id?, venue_note_he?, venue_note_en?, luma_url?, is_tentative,
--       status, speaker_ids: [uuid, ...] (in display order) }
-- Returns the event id. Table constraints (slug format, ends_at > starts_at, https URLs) still apply.
create or replace function public.admin_save_event(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id       uuid := nullif(p ->> 'id', '')::uuid;
  v_speakers jsonb := coalesce(p -> 'speaker_ids', '[]'::jsonb);
begin
  perform public.assert_admin();
  if jsonb_typeof(v_speakers) <> 'array' then
    raise exception 'speaker_ids must be an array' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.events (
      slug, cohort_id, kind, series, series_no, title_he, title_en, blurb_he, blurb_en,
      starts_at, ends_at, venue_id, venue_note_he, venue_note_en, luma_url, is_tentative, status, updated_by
    ) values (
      p ->> 'slug', (p ->> 'cohort_id')::uuid, (p ->> 'kind')::public.event_kind,
      nullif(p ->> 'series', ''), nullif(p ->> 'series_no', '')::smallint,
      p ->> 'title_he', p ->> 'title_en', nullif(p ->> 'blurb_he', ''), nullif(p ->> 'blurb_en', ''),
      (p ->> 'starts_at')::timestamptz, (p ->> 'ends_at')::timestamptz,
      nullif(p ->> 'venue_id', '')::uuid, nullif(p ->> 'venue_note_he', ''), nullif(p ->> 'venue_note_en', ''),
      nullif(p ->> 'luma_url', ''), coalesce((p ->> 'is_tentative')::boolean, false),
      (p ->> 'status')::public.publish_status, auth.uid()
    ) returning id into v_id;
  else
    update public.events e set
      slug = p ->> 'slug',
      cohort_id = (p ->> 'cohort_id')::uuid,
      kind = (p ->> 'kind')::public.event_kind,
      series = nullif(p ->> 'series', ''),
      series_no = nullif(p ->> 'series_no', '')::smallint,
      title_he = p ->> 'title_he',
      title_en = p ->> 'title_en',
      blurb_he = nullif(p ->> 'blurb_he', ''),
      blurb_en = nullif(p ->> 'blurb_en', ''),
      starts_at = (p ->> 'starts_at')::timestamptz,
      ends_at = (p ->> 'ends_at')::timestamptz,
      venue_id = nullif(p ->> 'venue_id', '')::uuid,
      venue_note_he = nullif(p ->> 'venue_note_he', ''),
      venue_note_en = nullif(p ->> 'venue_note_en', ''),
      luma_url = nullif(p ->> 'luma_url', ''),
      is_tentative = coalesce((p ->> 'is_tentative')::boolean, false),
      status = (p ->> 'status')::public.publish_status,
      updated_by = auth.uid()
    where e.id = v_id;
    if not found then
      raise exception 'unknown event' using errcode = '22023';
    end if;
  end if;

  delete from public.event_speakers es where es.event_id = v_id;
  insert into public.event_speakers (event_id, speaker_id, sort)
    select v_id, s.value::uuid, (s.ordinality - 1)::smallint
    from jsonb_array_elements_text(v_speakers) with ordinality as s(value, ordinality);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges (Supabase grants EXECUTE to everyone by default)
-- ---------------------------------------------------------------------------
revoke all on function
  public.avatar_owner_folder(text), public.update_my_name(text), public.member_directory(),
  public.member_profile(uuid), public.admin_save_event(jsonb)
  from public, anon, authenticated;

-- Used inside storage policies.
grant execute on function public.avatar_owner_folder(text) to authenticated;
grant execute on function public.update_my_name(text), public.member_directory(),
  public.member_profile(uuid), public.admin_save_event(jsonb)
  to authenticated;
