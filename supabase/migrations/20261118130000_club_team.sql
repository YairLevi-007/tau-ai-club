-- The club's founders ("Meet the club's founders" on the home page).
--
-- Public profile data only: name, role, company, photo, public LinkedIn. No contact data.
-- Roles and company names are in English on both locales (same rule as speakers).
--
-- Access: anon/authenticated read published rows. Writes go through the service role
-- for now; Milestone 2 adds an is_admin() write policy here, as for the other tables.

create table public.club_team (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_he      text not null,
  name_en      text not null,
  role_en      text,
  company_en   text,
  photo_url    text
    constraint club_team_photo_url_check
    check (photo_url is null or photo_url ~ '^https://' or photo_url ~ '^/team/[a-z0-9-]+\.(webp|jpg|png)$'),
  linkedin_url text
    constraint club_team_linkedin_url_check
    check (linkedin_url is null or linkedin_url ~ '^https://www\.linkedin\.com/in/[A-Za-z0-9_%-]{2,100}/?$'),
  sort         smallint not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index club_team_published_sort_idx on public.club_team (sort) where is_published;

create trigger club_team_updated_at before update on public.club_team
  for each row execute function public.set_updated_at();

revoke all on public.club_team from anon, authenticated;
grant select on public.club_team to anon, authenticated;

alter table public.club_team enable row level security;

create policy "published team members are public"
  on public.club_team for select
  to anon, authenticated
  using (is_published);
