-- Interactive HTML lessons next to a lecture's PDF summary (Ido's quizzes).
--
-- A lesson is one more row in event_files, kept in the same PRIVATE `event-files` bucket, with
-- the same rules: members read it only while it is published on a published event, and only
-- admins write. What changes:
--   * event_files.path may end in .html as well as .pdf; `kind` says which ('pdf' | 'lesson').
--   * The bucket accepts text/plain too. Lessons are stored as text/plain on purpose: Storage
--     never serves them as a web page. The site serves them itself, from /api/lessons/<id>,
--     inside a sandbox (an opaque origin: no cookies, no site storage, no network).
-- Nothing else (grants, table RLS, Storage RLS) changes: the existing policies already key on
-- event_files.path and status, whatever the extension.

alter table public.event_files drop constraint if exists event_files_path_check;
alter table public.event_files
  add constraint event_files_path_check
  check (path ~ '^[a-z0-9][a-z0-9-]*/[A-Za-z0-9][A-Za-z0-9._-]*\.(pdf|html)$');

alter table public.event_files
  add column kind text generated always as (case when path ~ '\.html$' then 'lesson' else 'pdf' end) stored;

update storage.buckets
  set allowed_mime_types = array['application/pdf', 'text/plain']
  where id = 'event-files';
