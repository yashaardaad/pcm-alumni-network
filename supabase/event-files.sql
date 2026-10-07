-- PCM Alumni Network: event files
-- Run this once, after schema.sql, in the same project: SQL Editor > New query > paste > Run.
--
-- Up to 3 files per event (PDF, Word, Excel, or PowerPoint, up to 20 MB
-- each), stored in a private "event-files" bucket. Any admin (whether a
-- current member or an alum) can add or remove a file on any event, no
-- matter whether it is past, present, or future. Anyone who can see the
-- event can view its files.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-files', 'event-files', false, 20971520, array[
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict (id) do nothing;

create table public.event_files (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 160),
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index event_files_event_idx on public.event_files (event_id);
alter table public.event_files enable row level security;

create policy "event files: read" on public.event_files for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id and (public.can_see_audience(e.audience) or e.created_by = auth.uid())
    )
  );

-- Security definer: runs as the table owner, so counting rows here does
-- not re-trigger this table's own RLS policies (which would otherwise be
-- a self-reference and raise "infinite recursion detected in policy").
create function public.event_file_count(p_event uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.event_files where event_id = p_event;
$$;

create policy "event files: admin add" on public.event_files for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.is_admin()
    and public.event_file_count(event_id) < 3
  );

create policy "event files: admin remove" on public.event_files for delete to authenticated
  using (public.is_admin());

grant select, insert, delete on public.event_files to authenticated;
grant execute on function public.event_file_count(uuid) to authenticated;

create policy "event-files bucket: admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-files' and public.is_admin());

create policy "event-files bucket: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-files' and public.is_admin());

create policy "event-files bucket: approved read" on storage.objects for select to authenticated
  using (
    bucket_id = 'event-files'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved')
  );
