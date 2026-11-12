-- Milestone 1: public content tables (cohorts, venues, speakers, events, event_speakers) + RLS.
-- Source of truth for the design: docs/PLAN.md §2.
--
-- Security model for M1:
--   * RLS is ON for every table.
--   * anon + authenticated may only SELECT, and only published content.
--   * Nobody but the service role (SQL editor / migrations / seed) can write in M1.
--     Milestone 2 adds is_admin() and admin write policies.
--   * speakers holds NO contact data, ever. Contact data lives in speaker_contacts (M2),
--     which anon can never read.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.event_kind as enum ('opening', 'lecture', 'workshop', 'joint', 'closing', 'other');
create type public.publish_status as enum ('draft', 'published');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.cohorts (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_he     text not null,
  name_en     text not null,
  tagline_he  text,
  tagline_en  text,
  starts_on   date not null,
  ends_on     date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.venues (
  id          uuid primary key default gen_random_uuid(),
  name_he     text not null,
  name_en     text not null,
  address_he  text,
  address_en  text,
  maps_url    text check (maps_url is null or maps_url ~ '^https://'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Public speaker profile only. No email / phone / private links here, ever.
create table public.speakers (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_he     text not null,
  name_en     text not null,
  company_he  text,
  company_en  text,
  role_he     text,
  role_en     text,
  bio_he      text,
  bio_en      text,
  photo_url   text check (photo_url is null or photo_url ~ '^https://'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]+$'),
  cohort_id     uuid not null references public.cohorts (id) on delete restrict,
  kind          public.event_kind not null default 'other',
  series        text check (series is null or series ~ '^[a-z0-9-]+$'),
  series_no     smallint check (series_no is null or series_no > 0),
  title_he      text not null,
  title_en      text not null,
  blurb_he      text,
  blurb_en      text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  venue_id      uuid references public.venues (id) on delete set null, -- null = venue TBD
  venue_note_he text,
  venue_note_en text,
  luma_url      text check (luma_url is null or luma_url ~ '^https://'),
  is_tentative  boolean not null default false,
  status        public.publish_status not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  check (ends_at > starts_at)
);

create index events_cohort_starts_idx on public.events (cohort_id, starts_at);
create index events_published_ends_idx on public.events (ends_at) where status = 'published';
create index events_venue_idx on public.events (venue_id);

create table public.event_speakers (
  event_id   uuid not null references public.events (id) on delete cascade,
  speaker_id uuid not null references public.speakers (id) on delete restrict,
  sort       smallint not null default 0,
  primary key (event_id, speaker_id)
);

create index event_speakers_speaker_idx on public.event_speakers (speaker_id);

-- updated_at triggers
create trigger cohorts_updated_at  before update on public.cohorts  for each row execute function public.set_updated_at();
create trigger venues_updated_at   before update on public.venues   for each row execute function public.set_updated_at();
create trigger speakers_updated_at before update on public.speakers for each row execute function public.set_updated_at();
create trigger events_updated_at   before update on public.events   for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges: read-only for API roles. Writes go through the service role in M1.
-- ---------------------------------------------------------------------------
revoke all on public.cohorts, public.venues, public.speakers, public.events, public.event_speakers
  from anon, authenticated;
grant select on public.cohorts, public.venues, public.speakers, public.events, public.event_speakers
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.cohorts        enable row level security;
alter table public.venues         enable row level security;
alter table public.speakers       enable row level security;
alter table public.events         enable row level security;
alter table public.event_speakers enable row level security;

create policy "cohorts are public"
  on public.cohorts for select
  to anon, authenticated
  using (true);

create policy "venues are public"
  on public.venues for select
  to anon, authenticated
  using (true);

create policy "published events are public"
  on public.events for select
  to anon, authenticated
  using (status = 'published');

-- A speaker is visible only once they are attached to a published event,
-- so a draft line-up doesn't leak.
create policy "speakers of published events are public"
  on public.speakers for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.event_speakers es
      join public.events e on e.id = es.event_id
      where es.speaker_id = speakers.id
        and e.status = 'published'
    )
  );

create policy "line-ups of published events are public"
  on public.event_speakers for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_speakers.event_id
        and e.status = 'published'
    )
  );
