-- pAIr: 1:1 intro conversations before each meetup (the "meeting games" card in /me,
-- DECISIONS 18.11). Ported from the standalone pAIr app; the site's members, sign-in and
-- profiles replace pAIr's own participants and join requests, and Luma attendance fills
-- in who is coming.
--
--   * pair_rounds         one per event: draft (only admins see it) or published.
--   * pair_round_people   who is coming to that meetup. Filled from `attendance` (registered
--                         or checked in) when the round is opened; an admin adds or removes.
--   * pair_groups         the conversations of a round: pairs, plus one trio when the count is
--                         odd. An admin can mark a conversation as met or missed.
--   * pair_group_members  who is in each conversation (one conversation per person per round).
--   * pair_confirms       "the meeting happened", pressed by a member of that conversation.
--
-- A pair counts as "met" if an admin marked the conversation met, or either of the two
-- confirmed, unless an admin marked it missed (same rule as pAIr; computed in the app).
--
-- Admins read every table directly. Members read nothing directly: they get only their own
-- published conversations through my_pair_matches(), with the partner's profile fields that
-- members can already see through member_profile(). Every write goes through an RPC below.

create type public.pair_round_status as enum ('draft', 'published');
create type public.pair_mark as enum ('met', 'missed');

create table public.pair_rounds (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null unique references public.events (id) on delete cascade,
  status        public.pair_round_status not null default 'draft',
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.members (id) on delete set null,
  check ((status = 'published') = (published_at is not null))
);

create table public.pair_round_people (
  round_id   uuid not null references public.pair_rounds (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete cascade,
  source     text not null default 'manual' check (source in ('luma', 'manual')),
  added_at   timestamptz not null default now(),
  primary key (round_id, member_id)
);
create index pair_round_people_member_idx on public.pair_round_people (member_id);

create table public.pair_groups (
  id        uuid primary key default gen_random_uuid(),
  round_id  uuid not null references public.pair_rounds (id) on delete cascade,
  sort      smallint not null check (sort >= 0),
  mark      public.pair_mark,
  unique (round_id, sort),
  unique (id, round_id)
);

create table public.pair_group_members (
  group_id   uuid not null,
  round_id   uuid not null,
  member_id  uuid not null,
  primary key (group_id, member_id),
  unique (round_id, member_id),
  foreign key (group_id, round_id) references public.pair_groups (id, round_id) on delete cascade,
  foreign key (round_id, member_id) references public.pair_round_people (round_id, member_id) on delete cascade
);
create index pair_group_members_member_idx on public.pair_group_members (member_id);

create table public.pair_confirms (
  round_id      uuid not null,
  member_id     uuid not null,
  confirmed_at  timestamptz not null default now(),
  primary key (round_id, member_id),
  foreign key (round_id, member_id) references public.pair_group_members (round_id, member_id) on delete cascade
);

-- Reads only; every write goes through the functions below.
revoke all on public.pair_rounds, public.pair_round_people, public.pair_groups,
  public.pair_group_members, public.pair_confirms from public, anon, authenticated;
grant select on public.pair_rounds, public.pair_round_people, public.pair_groups,
  public.pair_group_members, public.pair_confirms to authenticated;

alter table public.pair_rounds        enable row level security;
alter table public.pair_round_people  enable row level security;
alter table public.pair_groups        enable row level security;
alter table public.pair_group_members enable row level security;
alter table public.pair_confirms      enable row level security;

create policy "admins read pair rounds"   on public.pair_rounds        for select to authenticated using ((select public.is_admin()));
create policy "admins read pair people"   on public.pair_round_people  for select to authenticated using ((select public.is_admin()));
create policy "admins read pair groups"   on public.pair_groups        for select to authenticated using ((select public.is_admin()));
create policy "admins read pair members"  on public.pair_group_members for select to authenticated using ((select public.is_admin()));
create policy "admins read pair confirms" on public.pair_confirms      for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

-- The round for an event, created on first open with everyone registered on Luma (or checked
-- in) who is an active member. Returns the round id.
create or replace function public.admin_pair_open_round(p_event_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_round uuid;
begin
  perform public.assert_admin();
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    raise exception 'unknown event' using errcode = '22023';
  end if;
  select r.id into v_round from public.pair_rounds r where r.event_id = p_event_id;
  if v_round is not null then
    return v_round;
  end if;
  insert into public.pair_rounds (event_id, created_by)
    values (p_event_id, public.current_member_id())
    on conflict (event_id) do nothing
    returning id into v_round;
  if v_round is null then
    select r.id into v_round from public.pair_rounds r where r.event_id = p_event_id;
    return v_round;
  end if;
  insert into public.pair_round_people (round_id, member_id, source)
    select v_round, a.member_id, 'luma'
    from public.attendance a
    join public.members m on m.id = a.member_id and m.status = 'active'
    where a.event_id = p_event_id and a.status in ('registered', 'checked_in');
  return v_round;
end;
$$;

-- Internal: the round, locked, and checked to be a draft.
create or replace function public.pair_draft_round(p_round_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status public.pair_round_status;
begin
  select r.status into v_status from public.pair_rounds r where r.id = p_round_id for update;
  if not found then
    raise exception 'unknown round' using errcode = '22023';
  end if;
  if v_status <> 'draft' then
    raise exception 'round is published; unpublish it first' using errcode = '22023';
  end if;
end;
$$;

-- Who is coming: replaces the list. Anyone in the Luma import keeps source = 'luma'. Any change
-- to the list clears the conversations (as in pAIr: "attendance changed, matching reset").
create or replace function public.admin_pair_set_people(p_round_id uuid, p_member_ids uuid[])
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event   uuid;
  v_ids     uuid[] := coalesce((select array_agg(distinct x) from unnest(p_member_ids) as x where x is not null), '{}');
  v_changed boolean;
begin
  perform public.assert_admin();
  perform public.pair_draft_round(p_round_id);
  if cardinality(v_ids) > 2000 then
    raise exception 'too many people' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_ids) as x
    where not exists (select 1 from public.members m where m.id = x and m.status = 'active')
  ) then
    raise exception 'unknown member' using errcode = '22023';
  end if;
  select r.event_id into v_event from public.pair_rounds r where r.id = p_round_id;

  v_changed := exists (select 1 from public.pair_round_people p where p.round_id = p_round_id and p.member_id <> all (v_ids))
            or exists (select 1 from unnest(v_ids) as x
                       where not exists (select 1 from public.pair_round_people p where p.round_id = p_round_id and p.member_id = x));
  if not v_changed then
    return cardinality(v_ids);
  end if;

  delete from public.pair_groups g where g.round_id = p_round_id;
  delete from public.pair_round_people p where p.round_id = p_round_id and p.member_id <> all (v_ids);
  insert into public.pair_round_people (round_id, member_id, source)
    select p_round_id, x,
           case when exists (select 1 from public.attendance a
                             where a.event_id = v_event and a.member_id = x and a.status in ('registered', 'checked_in'))
                then 'luma' else 'manual' end
    from unnest(v_ids) as x
    on conflict (round_id, member_id) do nothing;
  return cardinality(v_ids);
end;
$$;

-- The conversations of a draft round, replaced in one go. p_groups: [[member_id, member_id], ...],
-- each of 2 or 3 people who are on the round's list, nobody twice.
create or replace function public.admin_pair_save_groups(p_round_id uuid, p_groups jsonb)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group jsonb;
  v_id    uuid;
  v_i     int := 0;
begin
  perform public.assert_admin();
  perform public.pair_draft_round(p_round_id);
  if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups) > 1000 then
    raise exception 'groups must be a JSON array' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_groups) as g
    where jsonb_typeof(g) is distinct from 'array' or jsonb_array_length(g) not between 2 and 3
  ) then
    raise exception 'each conversation has 2 or 3 people' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_groups) as g, jsonb_array_elements(g) as m
    where jsonb_typeof(m) is distinct from 'string'
       or (m #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'members must be ids' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_groups) as g, jsonb_array_elements_text(g) as m)
     <> (select count(distinct m) from jsonb_array_elements(p_groups) as g, jsonb_array_elements_text(g) as m) then
    raise exception 'a person appears twice' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_groups) as g, jsonb_array_elements_text(g) as m
    where not exists (select 1 from public.pair_round_people p where p.round_id = p_round_id and p.member_id = m::uuid)
  ) then
    raise exception 'everyone must be on the round''s list' using errcode = '22023';
  end if;

  delete from public.pair_groups g where g.round_id = p_round_id;
  for v_group in select value from jsonb_array_elements(p_groups) loop
    insert into public.pair_groups (round_id, sort) values (p_round_id, v_i) returning id into v_id;
    insert into public.pair_group_members (group_id, round_id, member_id)
      select v_id, p_round_id, m::uuid from jsonb_array_elements_text(v_group) as m;
    v_i := v_i + 1;
  end loop;
  return v_i;
end;
$$;

-- Publish (members see their conversation) or take back to draft. Taking it back clears the
-- members' "it happened" confirmations of that round, as pAIr did; admin marks stay.
create or replace function public.admin_pair_publish(p_round_id uuid, p_publish boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  perform 1 from public.pair_rounds r where r.id = p_round_id for update;
  if not found then
    raise exception 'unknown round' using errcode = '22023';
  end if;
  if p_publish then
    if not exists (select 1 from public.pair_groups g where g.round_id = p_round_id) then
      raise exception 'nothing to publish' using errcode = '22023';
    end if;
    update public.pair_rounds r set status = 'published', published_at = coalesce(r.published_at, now())
      where r.id = p_round_id;
  else
    delete from public.pair_confirms c where c.round_id = p_round_id;
    update public.pair_rounds r set status = 'draft', published_at = null where r.id = p_round_id;
  end if;
end;
$$;

-- An admin's mark on a conversation of a published round: 'met', 'missed', or null (go by the
-- members' confirmations).
create or replace function public.admin_pair_mark_group(p_group_id uuid, p_mark text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_mark is not null and p_mark not in ('met', 'missed') then
    raise exception 'mark must be met, missed or null' using errcode = '22023';
  end if;
  update public.pair_groups g set mark = p_mark::public.pair_mark
  from public.pair_rounds r
  where g.id = p_group_id and r.id = g.round_id and r.status = 'published';
  if not found then
    raise exception 'unknown conversation, or its round is not published' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.admin_pair_delete_round(p_round_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  delete from public.pair_rounds r where r.id = p_round_id;
  if not found then
    raise exception 'unknown round' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Member RPCs
-- ---------------------------------------------------------------------------

-- The signed-in member's conversations in published rounds, newest meetup first. Partners carry
-- only what member_profile() already shows members (no emails, no phone, no role).
create or replace function public.my_pair_matches()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.item order by x.starts_at desc), '[]'::jsonb)
  from (
    select e.starts_at, jsonb_build_object(
      'round_id', r.id,
      'event_id', e.id,
      'slug', e.slug,
      'title_he', e.title_he,
      'title_en', e.title_en,
      'starts_at', e.starts_at,
      'published_at', r.published_at,
      'confirmed_at', c.confirmed_at,
      'partners', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id, 'full_name', m.full_name, 'photo_url', p.photo_url, 'year', p.year,
                 'faculty', p.faculty, 'program', p.program, 'bio_he', p.bio_he, 'bio_en', p.bio_en,
                 'links', coalesce(p.links, '{}'::jsonb))
               order by m.full_name)
        from public.pair_group_members o
        join public.members m on m.id = o.member_id and m.status = 'active'
        left join public.profiles p on p.member_id = m.id
        where o.group_id = gm.group_id and o.member_id <> gm.member_id
      ), '[]'::jsonb)
    ) as item
    from public.pair_group_members gm
    join public.pair_rounds r on r.id = gm.round_id and r.status = 'published'
    join public.events e on e.id = r.event_id
    left join public.pair_confirms c on c.round_id = gm.round_id and c.member_id = gm.member_id
    where public.is_member() and gm.member_id = public.current_member_id()
  ) x
$$;

-- "The meeting happened" (p_on = true) or take it back. Only for your own conversation in a
-- published round. Returns the confirmation time, or null.
create or replace function public.confirm_my_pair(p_round_id uuid, p_on boolean)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member uuid := public.current_member_id();
  v_at     timestamptz;
begin
  if v_member is null then
    raise exception 'members only' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.pair_group_members gm
    join public.pair_rounds r on r.id = gm.round_id and r.status = 'published'
    where gm.round_id = p_round_id and gm.member_id = v_member
  ) then
    raise exception 'not your conversation' using errcode = '42501';
  end if;
  if p_on then
    insert into public.pair_confirms (round_id, member_id) values (p_round_id, v_member)
      on conflict (round_id, member_id) do nothing;
    select c.confirmed_at into v_at from public.pair_confirms c where c.round_id = p_round_id and c.member_id = v_member;
  else
    delete from public.pair_confirms c where c.round_id = p_round_id and c.member_id = v_member;
  end if;
  return v_at;
end;
$$;

revoke all on function
  public.admin_pair_open_round(uuid), public.pair_draft_round(uuid), public.admin_pair_set_people(uuid, uuid[]),
  public.admin_pair_save_groups(uuid, jsonb), public.admin_pair_publish(uuid, boolean),
  public.admin_pair_mark_group(uuid, text), public.admin_pair_delete_round(uuid),
  public.my_pair_matches(), public.confirm_my_pair(uuid, boolean)
  from public, anon, authenticated;
grant execute on function
  public.admin_pair_open_round(uuid), public.admin_pair_set_people(uuid, uuid[]),
  public.admin_pair_save_groups(uuid, jsonb), public.admin_pair_publish(uuid, boolean),
  public.admin_pair_mark_group(uuid, text), public.admin_pair_delete_round(uuid),
  public.my_pair_matches(), public.confirm_my_pair(uuid, boolean)
  to authenticated;
