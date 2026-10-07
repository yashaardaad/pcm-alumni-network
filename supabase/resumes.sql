-- PCM Alumni Network: resume uploads
-- Run this once, after schema.sql, in the same project: SQL Editor > New query > paste > Run.
--
-- Current members only can upload one resume (PDF), stored as
-- {user_id}.pdf in a private "resumes" bucket. Any approved, signed-in
-- user (including alumni, for reviewing it) can view it -- the same
-- visibility as the rest of a profile (bio, LinkedIn). Only the owner,
-- and only while they are a current member, can upload, replace, or
-- remove their own file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy "resumes: owner manage" on storage.objects for all to authenticated
  using (
    bucket_id = 'resumes' and owner = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'member')
  )
  with check (
    bucket_id = 'resumes' and owner = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'member')
  );

create policy "resumes: approved read" on storage.objects for select to authenticated
  using (
    bucket_id = 'resumes'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved')
  );
