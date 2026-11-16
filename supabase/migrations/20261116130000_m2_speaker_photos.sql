-- Milestone 2, part 3: speaker photos in Storage (for the flyer import's face crop).
--
-- Speaker profiles are public once a speaker is on a published event, and the site
-- already shows speakers.photo_url through next/image (*.supabase.co). So this bucket is
-- PUBLIC for reading (objects are served from /storage/v1/object/public/...), and only
-- admins can write. File names are random, so a draft speaker's photo URL isn't guessable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('speaker-photos', 'speaker-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "admins upload speaker photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'speaker-photos' and (select public.is_admin()));

create policy "admins replace speaker photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'speaker-photos' and (select public.is_admin()))
  with check (bucket_id = 'speaker-photos' and (select public.is_admin()));

create policy "admins delete speaker photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'speaker-photos' and (select public.is_admin()));

-- Admins list/read objects through the API (public URLs need no policy).
create policy "admins read speaker photo objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'speaker-photos' and (select public.is_admin()));
