-- Milestone 3: lecture and workshop content.
--
-- event_content holds the write-up of an event, one row per section (Markdown, he/en):
--   lectures:  blurb (the public teaser), summary, goals, takeaways
--   workshops: summary, commands, exercises, resources, prep (the prep checklist)
-- Each section has its own visibility (public | members) and status (draft | published).
--   * anon and non-members: published + public sections of published events only.
--   * members: every published section of published events.
--   * admins: everything, and they are the only writers.
-- body_en null means "Hebrew only for now": the site shows the Hebrew text with a note,
-- never a machine translation.
--
-- event_files lists the original files (e.g. the lecture's PDF) kept in the PRIVATE
-- Storage bucket `event-files`. Members download them through short-lived signed URLs;
-- Storage RLS only lets a member read an object that a published event_files row points to.

create type public.content_section as enum (
  'blurb', 'summary', 'goals', 'takeaways', 'commands', 'exercises', 'resources', 'prep'
);
create type public.content_visibility as enum ('public', 'members');

create table public.event_content (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  section     public.content_section not null,
  body_he     text not null default '' check (length(body_he) <= 60000),
  body_en     text check (length(body_en) <= 60000),
  visibility  public.content_visibility not null default 'members',
  status      public.publish_status not null default 'draft',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.members (id) on delete set null,
  unique (event_id, section)
);

create trigger event_content_updated_at
  before update on public.event_content
  for each row execute function public.set_updated_at();

create table public.event_files (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  -- Object name inside the `event-files` bucket: <event slug>/<file>.pdf
  path        text not null unique check (path ~ '^[a-z0-9][a-z0-9-]*/[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$'),
  title_he    text not null check (length(title_he) between 1 and 200),
  title_en    text not null check (length(title_en) between 1 and 200),
  status      public.publish_status not null default 'draft',
  created_at  timestamptz not null default now()
);

create index event_files_event_id_idx on public.event_files (event_id);

-- ---------------------------------------------------------------------------
-- Grants (Supabase grants everything by default: start from nothing)
-- ---------------------------------------------------------------------------
revoke all on public.event_content, public.event_files from public, anon, authenticated;
grant select on public.event_content to anon, authenticated;
grant select on public.event_files to authenticated;
grant insert, update, delete on public.event_content, public.event_files to authenticated;

alter table public.event_content enable row level security;
alter table public.event_files   enable row level security;

-- Everyone: published, public sections of published events.
create policy "public sections of published events"
  on public.event_content for select
  to anon, authenticated
  using (
    status = 'published'
    and visibility = 'public'
    and exists (select 1 from public.events e where e.id = event_content.event_id and e.status = 'published')
  );

-- Members: every published section of a published event.
create policy "members read published sections"
  on public.event_content for select
  to authenticated
  using (
    status = 'published'
    and (select public.is_member())
    and exists (select 1 from public.events e where e.id = event_content.event_id and e.status = 'published')
  );

create policy "admins manage event content"
  on public.event_content for all
  to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "members read published files"
  on public.event_files for select
  to authenticated
  using (
    status = 'published'
    and (select public.is_member())
    and exists (select 1 from public.events e where e.id = event_files.event_id and e.status = 'published')
  );

create policy "admins manage event files"
  on public.event_files for all
  to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for the original files (PDF only, up to 10 MB)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-files', 'event-files', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Members read (and so can sign URLs for) an object only while a published row points at it.
create policy "members read published event files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-files'
    and (select public.is_member())
    and exists (
      select 1
      from public.event_files f
      join public.events e on e.id = f.event_id
      where f.path = storage.objects.name and f.status = 'published' and e.status = 'published'
    )
  );

create policy "admins read event files"
  on storage.objects for select to authenticated
  using (bucket_id = 'event-files' and (select public.is_admin()));

create policy "admins upload event files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-files' and (select public.is_admin()));

create policy "admins replace event files"
  on storage.objects for update to authenticated
  using (bucket_id = 'event-files' and (select public.is_admin()))
  with check (bucket_id = 'event-files' and (select public.is_admin()));

create policy "admins delete event files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-files' and (select public.is_admin()));
