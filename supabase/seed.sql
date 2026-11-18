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
   '2026-11-01', '2027-07-31'); -- end date confirmed by the club 2026-11-18

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------
insert into public.venues (name_he, name_en, address_he, address_en) values
  ('אולם ברודקום',  'Broadcom Hall',           'אוניברסיטת תל אביב', 'Tel Aviv University'), -- from the 11.11 flyer
  ('בניין רקנאטי',  'Recanati Bldg.',          'אוניברסיטת תל אביב', 'Tel Aviv University'), -- from the 18.11 flyer; REVIEW Hebrew spelling
  ('המרכז ליזמות',  'Entrepreneurship Center', 'אוניברסיטת תל אביב', 'Tel Aviv University'), -- REVIEW
  ('משרדי MongoDB', 'MongoDB offices',         'תל אביב', 'Tel Aviv'),                       -- exact address comes with the Luma page
  ('משרדי Aleph',   'Aleph offices',           'תל אביב', 'Tel Aviv');                       -- exact address comes with the Luma page

-- ---------------------------------------------------------------------------
-- Speakers (public profile only, no contact data)
-- ---------------------------------------------------------------------------
insert into public.speakers (slug, name_he, name_en, company_he, company_en, role_he, role_en, photo_url, linkedin_url) values
  -- Hebrew name spellings approved by the club. Facts from the club's Instagram posts (brand/instagram/: "Meet our speakers" and the
  -- 11.11 / 18.11 flyers). English names as printed. Company names stay in Latin in Hebrew.
  -- Roles stay in English on both locales (club decision 2026-11-18). Photos are cropped from those posts.
  -- LinkedIn: all seven confirmed by the club (2026-11-18).
  ('shay-yahal',     'שי יהל',      'Shay Yahal',     'Stealth startup',      'Stealth startup',
   'Co-Founder', 'Co-Founder', -- Ex-AI & Data Eng. Manager, Grip Security; former researcher, Tel Aviv University
   '/speakers/shay-yahal.webp', 'https://www.linkedin.com/in/shay-yahal/'),
  ('oz-altagar',     'עוז אלטגר',   'Oz Altagar',     'AWS',                  'AWS',
   'Architect, Prototyping & AI Engineering', 'Architect, Prototyping & AI Engineering', -- The 18.11 flyer says "AI & Multi-Agent Systems, AWS · Speaker, AWS Summit Tel Aviv"
   '/speakers/oz-altagar.webp', 'https://www.linkedin.com/in/oz-altagar-0a50861b3/'),
  ('or-maccabi',     'אור מכבי',    'Or Maccabi',     'MongoDB',              'MongoDB',
   'AI Agents Israel', 'AI Agents Israel',
   '/speakers/or-maccabi.webp', 'https://www.linkedin.com/in/ormaccabi/'),
  ('roee-margalit',  'רועי מרגלית', 'Ro''ee Margalit', 'Rotate · Check Point', 'Rotate · Check Point',
   'Co-Founder & CEO', 'Co-Founder & CEO',
   '/speakers/roee-margalit.webp', 'https://www.linkedin.com/in/roee-margalit/'),
  ('tomer-diari',    'תומר דיארי',  'Tomer Diari',    'Aleph',                'Aleph',
   'General Partner', 'General Partner',
   '/speakers/tomer-diari.webp', 'https://www.linkedin.com/in/diari'), -- LinkedIn confirmed by the club (matches Aleph's site)
  ('ori-goshen',     'אורי גושן',   'Ori Goshen',     'AI21 Labs',            'AI21 Labs',
   'Co-Founder & CEO', 'Co-Founder & CEO',
   '/speakers/ori-goshen.webp', 'https://www.linkedin.com/in/ori-goshen/'),
  ('gavriel-goidel', 'גבריאל גוידל', 'Gavriel Goidel', 'Google',               'Google',
   'Head of Strategy + Operations', 'Head of Strategy + Operations',
   '/speakers/gavriel-goidel.webp', 'https://www.linkedin.com/in/goidelg/');

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
   'AI, עבר ועתיד: איך הגענו לכאן, ולאן אנחנו הולכים?', 'AI, past and future: how did we get here, and where are we heading?', -- 11.11 flyer; REVIEW Hebrew title
   'פתיחת מחזור 02. הרצאה ושאלות, שבירת קרח ונטוורקינג. יש אוכל.', 'Cohort 02 opening. Talk + Q&A, icebreaker, networking. Food included.', -- REVIEW Hebrew
   '2026-11-11', 'Broadcom Hall', null, null, false),

  ('zero-to-hero-1', 'workshop', 'zero-to-hero', 1,
   'Zero to Hero 1: Claude Code, חלק 1 מתוך 3', 'Zero to Hero 1: Claude Code, part 1 of 3',
   'בונים סוכני AI שעובדים בעולם האמיתי. סדנה מעשית: להביא לפטופ, עם Claude Code מותקן ומנוי Pro.', -- REVIEW Hebrew
   'Building AI agents that work in the real world. A hands-on workshop: bring a laptop with Claude Code installed and a Pro plan.',
   '2026-11-18', 'Recanati Bldg.', 'חדר 251', 'Room 251', false), -- 18.11 flyer

  ('zero-to-hero-2', 'workshop', 'zero-to-hero', 2,
   'Zero to Hero 2: Claude Code, חלק 2 מתוך 3', 'Zero to Hero 2: Claude Code, part 2 of 3',
   'להביא לפטופ, עם Claude Code מותקן ומנוי Pro.', 'Bring a laptop with Claude Code installed and a Pro plan.',
   '2026-11-25', 'Entrepreneurship Center', null, null, false),

  ('entrepreneurship-tech-or-maccabi', 'lecture', null, null,
   'יזמות וטכנולוגיה', 'Entrepreneurship & Tech', -- title approved by the club 2026-11-18
   null, null,
   '2026-12-02', 'MongoDB offices', null, null, false),

  ('zero-to-hero-3', 'workshop', 'zero-to-hero', 3,
   'Zero to Hero 3: Claude Code, חלק 3 מתוך 3', 'Zero to Hero 3: Claude Code, part 3 of 3',
   'להביא לפטופ, עם Claude Code מותקן ומנוי Pro.', 'Bring a laptop with Claude Code installed and a Pro plan.',
   '2026-12-16', null, 'מחוץ לקמפוס', 'Off campus', false), -- REVIEW venue TBD

  ('entrepreneurship-tech-roee-margalit', 'lecture', null, null,
   'יזמות וטכנולוגיה', 'Entrepreneurship & Tech', -- title approved by the club 2026-11-18
   null, null,
   '2026-12-23', null, null, null, false), -- REVIEW venue TBD

  ('growth-capital-tomer-diari', 'lecture', null, null,
   'צמיחה והון', 'Growth & Capital', -- title approved by the club 2026-11-18
   null, null,
   '2026-12-30', 'Aleph offices', null, null, false),

  -- A Sunday on purpose (every other event is a Wednesday); confirmed. Still tentative.
  ('joint-event-ori-goshen', 'joint', null, null,
   'אירוע משותף', 'Joint event', -- title approved by the club 2026-11-18
   null, null,
   '2027-01-03', 'Broadcom Hall', null, null, true),

  ('cohort-02-closing', 'closing', null, null,
   'אירוע סיום: Corporate, עם Google', 'Closing: Corporate, with Google', -- title approved by the club 2026-11-18
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
  ('cohort-02-opening',                   'shay-yahal'),
  ('zero-to-hero-1',                      'oz-altagar'),
  ('zero-to-hero-2',                      'oz-altagar'),
  ('zero-to-hero-3',                      'oz-altagar'),
  ('entrepreneurship-tech-or-maccabi',    'or-maccabi'),
  ('entrepreneurship-tech-roee-margalit', 'roee-margalit'),
  ('growth-capital-tomer-diari',          'tomer-diari'),
  ('joint-event-ori-goshen',              'ori-goshen'),
  ('cohort-02-closing',                   'gavriel-goidel')
) as l(event_slug, speaker_slug)
join public.events e   on e.slug = l.event_slug
join public.speakers s on s.slug = l.speaker_slug;

-- ---------------------------------------------------------------------------
-- The club's founders (home page). From the club's "Meet our managers" post
-- (brand/instagram/meet-our-managers.jpg); photos cropped from it. Roles and companies
-- in English on both locales. Hebrew names and LinkedIn URLs confirmed by the club (2026-11-18).
-- ---------------------------------------------------------------------------
insert into public.club_team (slug, name_he, name_en, role_en, company_en, photo_url, linkedin_url, sort, is_published) values
  ('aviv-valyevich', 'אביב ולואיביץ', 'Aviv Valyevich', 'Finance Ops Specialist', 'Silverfort',    '/team/aviv-valyevich.webp',
   'https://www.linkedin.com/in/aviv-valyevich/', 1, true),
  ('tali-amram',     'טלי עמרם',       'Tali Amram',     'Student Developer',      'XPLG',          '/team/tali-amram.webp',
   'https://www.linkedin.com/in/tali-amram-aa1067294/', 2, true),
  ('ido-perry',      'עידו פרי',       'Ido Perry',      'Product Manager',        'Reyymark',      '/team/ido-perry.webp',
   'https://www.linkedin.com/in/idoperryprofile/', 3, true),
  ('eric-berezin',   'אריק ברזין',     'Eric Berezin',   'Finance Operations',     'Investing.com', '/team/eric-berezin.webp',
   'https://www.linkedin.com/in/eric-berezin-648867338/', 4, true);

commit;
