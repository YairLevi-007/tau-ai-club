-- Initiatives (יוזמות): members propose things to do together, and the club says what it wants done
-- (DECISIONS 19.11, option 1 with two kinds; design/initiatives/).
--
--   * Members only. Guests and people who aren't on the club list see nothing.
--   * Any member proposes one. It's pending (only the proposer and admins see it) until an admin
--     publishes it, returns it with a note, or rejects it. An admin's own goes up at once as a
--     club initiative.
--   * Two kinds: 'member' (a member's idea) and 'club' (what the club wants done). When proposing,
--     a member chooses a personal initiative or a proposal for a club initiative (proposed_kind).
--     Either way an admin approves it first; the admin's "זו יוזמה של המועדון" switch starts from
--     that choice and the admin has the final say (kind is set at publish). The proposer stays
--     the lead.
--   * Every member can say "I'm in" (and cancel). Who joined is member data: a member sees only
--     their own joins; the lead and admins get the joiners' NAMES through initiative_people(),
--     never their emails. Everyone else gets counts only.
--
-- Members never write the tables directly: every member write is an RPC below that checks who is
-- calling and what state the initiative is in. Admins also have a table policy (edit, remove).
-- Free text from members is stored in the language they wrote it in (<field>_he or <field>_en);
-- the site falls back to the other language, as for all content.

create type public.initiative_kind as enum ('club', 'member');
create type public.initiative_category as enum ('hackathon', 'project', 'study_group', 'volunteering', 'other');
create type public.initiative_status as enum ('pending', 'returned', 'published', 'rejected');

create table public.initiatives (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.members (id) on delete cascade,
  kind            public.initiative_kind not null default 'member',
  -- What the proposer asked for: a personal initiative, or a proposal for a club initiative.
  -- Only a starting point for the admin's switch; kind is what's shown.
  proposed_kind   public.initiative_kind not null default 'member',
  category        public.initiative_category not null default 'other',
  status          public.initiative_status not null default 'pending',
  title_he        text check (title_he is null or char_length(title_he) between 1 and 120),
  title_en        text check (title_en is null or char_length(title_en) between 1 and 120),
  summary_he      text check (summary_he is null or char_length(summary_he) <= 3000),
  summary_en      text check (summary_en is null or char_length(summary_en) <= 3000),
  -- Free text as the lead writes it ("חמישי–שישי, 10–11 בדצמבר", "בניין שרייבר, חדר 006").
  when_text       text check (when_text is null or char_length(when_text) <= 120),
  where_text      text check (where_text is null or char_length(where_text) <= 120),
  spots           smallint check (spots is null or spots between 1 and 1000),
  signup_until    date,
  -- Why it's the club's (optional, written by the admin who published it as a club initiative).
  club_reason_he  text check (club_reason_he is null or char_length(club_reason_he) <= 500),
  club_reason_en  text check (club_reason_en is null or char_length(club_reason_en) <= 500),
  -- The admin's note to the lead when returning or rejecting. Cleared on publish.
  review_note     text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_by     uuid references public.members (id) on delete set null,
  reviewed_at     timestamptz,
  submitted_at    timestamptz not null default now(),
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint initiatives_has_title check (title_he is not null or title_en is not null),
  constraint initiatives_published_at check ((status = 'published') = (published_at is not null)),
  constraint initiatives_note_not_public check (status <> 'published' or review_note is null)
);

create index initiatives_lead_id_idx on public.initiatives (lead_id);
create index initiatives_status_idx on public.initiatives (status);

create trigger initiatives_updated_at
  before update on public.initiatives
  for each row execute function public.set_updated_at();

create table public.initiative_members (
  initiative_id  uuid not null references public.initiatives (id) on delete cascade,
  member_id      uuid not null references public.members (id) on delete cascade,
  joined_at      timestamptz not null default now(),
  primary key (initiative_id, member_id)
);

create index initiative_members_member_id_idx on public.initiative_members (member_id);

-- ---------------------------------------------------------------------------
-- Grants and RLS (start from nothing)
-- ---------------------------------------------------------------------------
revoke all on public.initiatives, public.initiative_members from public, anon, authenticated;
grant select, insert, update, delete on public.initiatives, public.initiative_members to authenticated;

alter table public.initiatives        enable row level security;
alter table public.initiative_members enable row level security;

-- Members: published initiatives, plus their own in any state. Admins: everything.
create policy "members read published and their own initiatives"
  on public.initiatives for select to authenticated
  using (
    (status = 'published' and (select public.is_member()))
    or lead_id = (select public.current_member_id())
  );

create policy "admins manage initiatives"
  on public.initiatives for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Who joined: each member sees only their own rows. Admins see and manage all of them.
create policy "members read their own joins"
  on public.initiative_members for select to authenticated
  using (member_id = (select public.current_member_id()));

create policy "admins manage joins"
  on public.initiative_members for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.assert_member()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.current_member_id();
begin
  if v_me is null then
    raise exception 'members only' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- Trimmed text, or null when empty.
create or replace function public.initiative_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p), '')
$$;

-- ---------------------------------------------------------------------------
-- Member RPCs
-- ---------------------------------------------------------------------------

-- Propose an initiative. A member's goes to the queue; an admin's is published at once as the club's.
-- p_lang says which language columns the text goes to ('he' or 'en').
create or replace function public.propose_initiative(
  p_lang text,
  p_proposed_kind public.initiative_kind,
  p_category public.initiative_category,
  p_title text,
  p_summary text,
  p_when text,
  p_where text,
  p_spots int,
  p_signup_until date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me    uuid := public.assert_member();
  v_admin boolean := public.is_admin();
  v_title text := public.initiative_text(p_title);
  v_id    uuid;
begin
  if p_lang not in ('he', 'en') then
    raise exception 'language must be he or en' using errcode = '22023';
  end if;
  if v_title is null then
    raise exception 'a title is required' using errcode = '23514';
  end if;
  -- Spam guard: at most 5 proposals waiting (pending or returned) per member.
  if not v_admin and (
    select count(*) from public.initiatives i
    where i.lead_id = v_me and i.status in ('pending', 'returned')
  ) >= 5 then
    raise exception 'too many proposals waiting for review' using errcode = '54000';
  end if;

  insert into public.initiatives (
    lead_id, kind, proposed_kind, category, status,
    title_he, title_en, summary_he, summary_en,
    when_text, where_text, spots, signup_until,
    reviewed_by, reviewed_at, published_at
  ) values (
    v_me,
    case when v_admin then 'club' else 'member' end::public.initiative_kind,
    case when v_admin then 'club' else coalesce(p_proposed_kind, 'member') end::public.initiative_kind,
    coalesce(p_category, 'other'),
    case when v_admin then 'published' else 'pending' end::public.initiative_status,
    case when p_lang = 'he' then v_title end,
    case when p_lang = 'en' then v_title end,
    case when p_lang = 'he' then public.initiative_text(p_summary) end,
    case when p_lang = 'en' then public.initiative_text(p_summary) end,
    public.initiative_text(p_when),
    public.initiative_text(p_where),
    p_spots,
    p_signup_until,
    case when v_admin then v_me end,
    case when v_admin then now() end,
    case when v_admin then now() end
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- The lead edits a proposal that is still pending, or was returned; it goes back to the queue.
create or replace function public.update_my_initiative(
  p_id uuid,
  p_lang text,
  p_proposed_kind public.initiative_kind,
  p_category public.initiative_category,
  p_title text,
  p_summary text,
  p_when text,
  p_where text,
  p_spots int,
  p_signup_until date
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me    uuid := public.assert_member();
  v_title text := public.initiative_text(p_title);
begin
  if p_lang not in ('he', 'en') then
    raise exception 'language must be he or en' using errcode = '22023';
  end if;
  if v_title is null then
    raise exception 'a title is required' using errcode = '23514';
  end if;
  update public.initiatives i set
    proposed_kind = coalesce(p_proposed_kind, 'member'),
    category     = coalesce(p_category, 'other'),
    title_he     = case when p_lang = 'he' then v_title else i.title_he end,
    title_en     = case when p_lang = 'en' then v_title else i.title_en end,
    summary_he   = case when p_lang = 'he' then public.initiative_text(p_summary) else i.summary_he end,
    summary_en   = case when p_lang = 'en' then public.initiative_text(p_summary) else i.summary_en end,
    when_text    = public.initiative_text(p_when),
    where_text   = public.initiative_text(p_where),
    spots        = p_spots,
    signup_until = p_signup_until,
    status       = 'pending',
    submitted_at = now()
  where i.id = p_id and i.lead_id = v_me and i.status in ('pending', 'returned');
  if not found then
    raise exception 'not your proposal, or it is no longer open for edits' using errcode = '42501';
  end if;
end;
$$;

-- The lead takes back a proposal that isn't published (pending, returned or rejected).
-- A published initiative stays; an admin can remove it.
create or replace function public.withdraw_my_initiative(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.assert_member();
begin
  delete from public.initiatives i
  where i.id = p_id and i.lead_id = v_me and i.status <> 'published';
  if not found then
    raise exception 'not your proposal, or it is already published' using errcode = '42501';
  end if;
end;
$$;

-- "I'm in": a member joins a published initiative that isn't full and whose sign-up is still open.
-- The lead leads it and doesn't join it. Joining twice is a no-op.
create or replace function public.join_initiative(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.assert_member();
  v_i  public.initiatives;
  v_n  int;
begin
  -- Lock the row so two last-spot joins can't both get in.
  select * into v_i from public.initiatives i where i.id = p_id and i.status = 'published' for update;
  if not found then
    raise exception 'no such initiative' using errcode = 'P0002';
  end if;
  if v_i.lead_id = v_me then
    raise exception 'the lead leads it' using errcode = '22023';
  end if;
  if exists (select 1 from public.initiative_members m where m.initiative_id = p_id and m.member_id = v_me) then
    return;
  end if;
  if v_i.signup_until is not null and v_i.signup_until < (now() at time zone 'Asia/Jerusalem')::date then
    raise exception 'sign-up has closed' using errcode = '22023';
  end if;
  if v_i.spots is not null then
    select count(*) into v_n from public.initiative_members m where m.initiative_id = p_id;
    if v_n >= v_i.spots then
      raise exception 'no spots left' using errcode = '22023';
    end if;
  end if;
  insert into public.initiative_members (initiative_id, member_id) values (p_id, v_me);
end;
$$;

-- Cancel "I'm in". Leaving something you never joined is a no-op.
create or replace function public.leave_initiative(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.assert_member();
begin
  delete from public.initiative_members m where m.initiative_id = p_id and m.member_id = v_me;
end;
$$;

-- What a card needs beyond the row: the lead's name and photo, how many are in, whether I'm in.
-- Only for initiatives the caller may see (published, their own, or any for an admin). No joiner names.
create or replace function public.initiative_cards()
returns table (
  initiative_id uuid,
  lead_name     text,
  lead_photo    text,
  joined_count  int,
  i_joined      boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me    uuid := public.assert_member();
  v_admin boolean := public.is_admin();
begin
  return query
    select
      i.id,
      m.full_name,
      p.photo_url,
      (select count(*)::int from public.initiative_members j where j.initiative_id = i.id),
      exists (select 1 from public.initiative_members j where j.initiative_id = i.id and j.member_id = v_me)
    from public.initiatives i
    join public.members m on m.id = i.lead_id
    left join public.profiles p on p.member_id = i.lead_id
    where i.status = 'published' or i.lead_id = v_me or v_admin;
end;
$$;

-- Who's in, by name: for the initiative's lead and for admins only. Never emails or contact data.
create or replace function public.initiative_people(p_id uuid)
returns table (member_id uuid, full_name text, photo_url text, joined_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.assert_member();
begin
  if not public.is_admin() and not exists (
    select 1 from public.initiatives i where i.id = p_id and i.lead_id = v_me
  ) then
    raise exception 'only the lead and admins see who is in' using errcode = '42501';
  end if;
  return query
    select j.member_id, m.full_name, p.photo_url, j.joined_at
    from public.initiative_members j
    join public.members m on m.id = j.member_id
    left join public.profiles p on p.member_id = j.member_id
    where j.initiative_id = p_id
    order by j.joined_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPC: the answer to a pending proposal
-- ---------------------------------------------------------------------------
-- p_decision: 'publish' | 'return' | 'reject'.
--   publish: shows it to all members. p_make_club is the "זו יוזמה של המועדון" switch, the
--            admin's final say (the page starts it from proposed_kind): true makes it a club
--            initiative, false a member's. p_club_reason (optional) is stored in p_lang.
--   return:  back to the lead with a note (required); they can edit and send it again.
--   reject:  closed, with an optional note. The lead still sees it, with the note.
create or replace function public.admin_review_initiative(
  p_id uuid,
  p_decision text,
  p_make_club boolean default false,
  p_note text default null,
  p_club_reason text default null,
  p_lang text default 'he'
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me     uuid := public.current_member_id();
  v_note   text := public.initiative_text(p_note);
  v_reason text := public.initiative_text(p_club_reason);
begin
  perform public.assert_admin();
  if p_decision not in ('publish', 'return', 'reject') then
    raise exception 'decision must be publish, return or reject' using errcode = '22023';
  end if;
  if p_decision = 'return' and v_note is null then
    raise exception 'a returned proposal needs a note' using errcode = '23514';
  end if;
  if p_lang not in ('he', 'en') then
    raise exception 'language must be he or en' using errcode = '22023';
  end if;

  update public.initiatives i set
    status         = case p_decision when 'publish' then 'published' when 'return' then 'returned' else 'rejected' end::public.initiative_status,
    kind           = case when p_decision = 'publish'
                       then (case when coalesce(p_make_club, false) then 'club' else 'member' end)::public.initiative_kind
                       else i.kind end,
    club_reason_he = case when p_decision = 'publish' and coalesce(p_make_club, false) and p_lang = 'he' then v_reason else i.club_reason_he end,
    club_reason_en = case when p_decision = 'publish' and coalesce(p_make_club, false) and p_lang = 'en' then v_reason else i.club_reason_en end,
    review_note    = case when p_decision = 'publish' then null else v_note end,
    published_at   = case when p_decision = 'publish' then now() else null end,
    reviewed_by    = v_me,
    reviewed_at    = now()
  where i.id = p_id and i.status = 'pending';
  if not found then
    raise exception 'no pending proposal with that id' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function
  public.assert_member(), public.initiative_text(text),
  public.propose_initiative(text, public.initiative_kind, public.initiative_category, text, text, text, text, int, date),
  public.update_my_initiative(uuid, text, public.initiative_kind, public.initiative_category, text, text, text, text, int, date),
  public.withdraw_my_initiative(uuid), public.join_initiative(uuid), public.leave_initiative(uuid),
  public.initiative_cards(), public.initiative_people(uuid),
  public.admin_review_initiative(uuid, text, boolean, text, text, text)
  from public, anon, authenticated;

grant execute on function
  public.propose_initiative(text, public.initiative_kind, public.initiative_category, text, text, text, text, int, date),
  public.update_my_initiative(uuid, text, public.initiative_kind, public.initiative_category, text, text, text, text, int, date),
  public.withdraw_my_initiative(uuid), public.join_initiative(uuid), public.leave_initiative(uuid),
  public.initiative_cards(), public.initiative_people(uuid),
  public.admin_review_initiative(uuid, text, boolean, text, text, text)
  to authenticated;
