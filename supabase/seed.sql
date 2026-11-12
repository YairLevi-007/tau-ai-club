-- Seed: Cohort 02 season (2026–27). Runs as the service role (bypasses RLS).
-- Everything here is editable later. Lines marked `-- REVIEW` hold a best-guess
-- Hebrew spelling / transliteration or an unconfirmed fact. Confirm before launch.
-- All events are 18:00–20:00 Israel time.

begin;

-- ---------------------------------------------------------------------------
-- Cohort
-- ---------------------------------------------------------------------------
insert into public.cohorts (slug, name_he, name_en, tagline_he, tagline_en, starts_on, ends_on) values
  ('02', 'מחזור 02', 'Cohort 02',
   'מועדון ה-AI של אוניברסיטת תל אביב. הרצאות של אנשים מהתעשייה, סדנאות Zero to Hero, ואנשים שפשוט אוהבים לבנות דברים.', -- REVIEW copy (designer, design/copy.md)
   'Tel Aviv University''s AI club. Talks from people in the industry, Zero to Hero workshops, and a room full of people who like building things.',
   '2026-11-01', '2027-07-31'); -- REVIEW cohort end date

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------
insert into public.venues (name_he, name_en, address_he, address_en) values
  ('אולם ברודקום',  'Broadcom Hall',           'אוניברסיטת תל אביב', 'Tel Aviv University'), -- REVIEW
  ('המרכז ליזמות',  'Entrepreneurship Center', 'אוניברסיטת תל אביב', 'Tel Aviv University'), -- REVIEW
  ('משרדי MongoDB', 'MongoDB offices',         null, null),                                  -- REVIEW address
  ('משרדי Aleph',   'Aleph offices',           null, null);                                  -- REVIEW address

-- ---------------------------------------------------------------------------
-- Speakers (public profile only, no contact data)
-- ---------------------------------------------------------------------------
insert into public.speakers (slug, name_he, name_en, company_he, company_en) values
  ('shai-yahel',    'שי יהל',     'Shai Yahel',    null, null), -- REVIEW spelling (the PDF file name says "Yahal")
  ('oz',            'עוז',         'Oz',            null, null), -- REVIEW full name + company
  ('or-maccabi',    'אור מכבי',    'Or Maccabi',    null, null), -- REVIEW
  ('roee-margalit', 'רועי מרגלית', 'Roee Margalit', null, null), -- REVIEW
  ('tomer-diari',   'תומר דיארי',  'Tomer Diari',   null, null), -- REVIEW
  ('ori-goshen',    'אורי גושן',   'Ori Goshen',    null, null); -- REVIEW

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
insert into public.events
  (slug, cohort_id, kind, series, series_no, title_he, title_en, blurb_he, blurb_en,
   starts_at, ends_at, venue_id, venue_note_he, venue_note_en, is_tentative, status)
select
  e.slug, c.id, e.kind::public.event_kind, e.series, e.series_no, e.title_he, e.title_en, e.blurb_he, e.blurb_en,
  (e.day || ' 18:00')::timestamp at time zone 'Asia/Jerusalem',
  (e.day || ' 20:00')::timestamp at time zone 'Asia/Jerusalem',
  v.id, e.venue_note_he, e.venue_note_en, e.is_tentative, 'published'
from (values
  ('cohort-02-opening', 'opening', null, null::smallint,
   'פתיחת מחזור 02: AI, עבר ועתיד', 'Cohort 02 opening: AI, past & future', -- REVIEW title
   null, null,
   '2026-11-11', 'Broadcom Hall', null, null, false),

  ('zero-to-hero-1', 'workshop', 'zero-to-hero', 1,
   'Zero to Hero 1: Claude', 'Zero to Hero 1: Claude',
   'להביא לפטופ, עם Claude Code מותקן ומנוי Pro.', 'Bring a laptop with Claude Code installed and a Pro plan.',
   '2026-11-18', null, 'בקמפוס', 'On campus', false), -- REVIEW room

  ('zero-to-hero-2', 'workshop', 'zero-to-hero', 2,
   'Zero to Hero 2: Claude', 'Zero to Hero 2: Claude',
   'להביא לפטופ, עם Claude Code מותקן ומנוי Pro.', 'Bring a laptop with Claude Code installed and a Pro plan.',
   '2026-11-25', 'Entrepreneurship Center', null, null, false),

  ('entrepreneurship-tech-or-maccabi', 'lecture', null, null,
   'יזמות וטכנולוגיה', 'Entrepreneurship & Tech', -- REVIEW title
   null, null,
   '2026-12-02', 'MongoDB offices', null, null, false),

  ('zero-to-hero-3', 'workshop', 'zero-to-hero', 3,
   'Zero to Hero 3: Claude', 'Zero to Hero 3: Claude',
   'להביא לפטופ, עם Claude Code מותקן ומנוי Pro.', 'Bring a laptop with Claude Code installed and a Pro plan.',
   '2026-12-16', null, 'מחוץ לקמפוס', 'Off campus', false), -- REVIEW venue TBD

  ('entrepreneurship-tech-roee-margalit', 'lecture', null, null,
   'יזמות וטכנולוגיה', 'Entrepreneurship & Tech', -- REVIEW title
   null, null,
   '2026-12-23', null, null, null, false), -- REVIEW venue TBD

  ('growth-capital-tomer-diari', 'lecture', null, null,
   'צמיחה והון', 'Growth & Capital', -- REVIEW title
   null, null,
   '2026-12-30', 'Aleph offices', null, null, false),

  -- A Sunday on purpose (every other event is a Wednesday). REVIEW date.
  ('joint-event-ori-goshen', 'joint', null, null,
   'אירוע משותף', 'Joint event', -- REVIEW title
   null, null,
   '2027-01-03', 'Broadcom Hall', null, null, true),

  ('cohort-02-closing', 'closing', null, null,
   'אירוע סיום: Corporate, עם Google', 'Closing: Corporate, with Google', -- REVIEW title
   null, null,
   '2027-01-06', null, null, null, false) -- REVIEW venue TBD
) as e(slug, kind, series, series_no, title_he, title_en, blurb_he, blurb_en,
       day, venue_name_en, venue_note_he, venue_note_en, is_tentative)
cross join (select id from public.cohorts where slug = '02') c
left join public.venues v on v.name_en = e.venue_name_en;

-- ---------------------------------------------------------------------------
-- Line-ups
-- ---------------------------------------------------------------------------
insert into public.event_speakers (event_id, speaker_id, sort)
select e.id, s.id, 0
from (values
  ('cohort-02-opening',                   'shai-yahel'),
  ('zero-to-hero-1',                      'oz'),
  ('zero-to-hero-2',                      'oz'),
  ('zero-to-hero-3',                      'oz'),
  ('entrepreneurship-tech-or-maccabi',    'or-maccabi'),
  ('entrepreneurship-tech-roee-margalit', 'roee-margalit'),
  ('growth-capital-tomer-diari',          'tomer-diari'),
  ('joint-event-ori-goshen',              'ori-goshen')
) as l(event_slug, speaker_slug)
join public.events e   on e.slug = l.event_slug
join public.speakers s on s.slug = l.speaker_slug;

commit;
