-- Speakers: a public LinkedIn profile link, entered by an admin.
--
-- This is public profile data (shown next to the speaker on the site), not contact
-- data. Consented contact details (email, phone, private links) belong in
-- speaker_contacts (M2) and never in this table.
--
-- Only https://www.linkedin.com/in/<handle> URLs: no other hosts or schemes, no
-- query strings or fragments, so a stored value can't become a javascript: link,
-- a redirect or a tracking URL.

alter table public.speakers
  add column linkedin_url text
  constraint speakers_linkedin_url_check
  check (linkedin_url is null or linkedin_url ~ '^https://www\.linkedin\.com/in/[A-Za-z0-9_%-]{2,100}/?$');

comment on column public.speakers.linkedin_url is
  'Public LinkedIn profile (https://www.linkedin.com/in/<handle>), admin-entered. Not contact data.';

-- Access is unchanged: anon/authenticated already read published speakers through the
-- existing table grant and RLS policy, and nothing but the service role can write.

-- Speakers: photos can also be the site's own static files (public/speakers/<slug>.webp,
-- cropped from the club's posts), served from the same origin. Still https:// for
-- anything external (Supabase Storage later).
alter table public.speakers drop constraint speakers_photo_url_check;
alter table public.speakers
  add constraint speakers_photo_url_check
  check (photo_url is null or photo_url ~ '^https://' or photo_url ~ '^/speakers/[a-z0-9-]+\.(webp|jpg|png)$');
