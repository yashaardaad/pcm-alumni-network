-- PCM Alumni Network: database schema
-- Run this once in a new Supabase project: SQL Editor > New query > paste > Run.
--
-- House rules enforced here (search for the numbers to change them):
--   * A member can have at most 3 open (pending) requests.
--   * An alum's monthly cap (default 3) counts requests they ACCEPT in a calendar month.
--   * A pending request expires after 14 days.
--   * The first account ever created becomes an approved admin. Everyone after waits for approval.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('member', 'alumni');
create type public.account_status as enum ('pending', 'approved', 'rejected');
create type public.request_type as enum ('coffee_chat', 'resume_review', 'mock_interview');
create type public.request_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'expired');
create type public.audience as enum ('alumni', 'members', 'all');
create type public.conversation_kind as enum ('channel', 'dm');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 80),
  role public.member_role not null default 'member',
  status public.account_status not null default 'pending',
  is_admin boolean not null default false,
  grad_year int check (grad_year between 1950 and 2100),
  headline text check (char_length(headline) <= 80),
  company text check (char_length(company) <= 80),
  sector text check (char_length(sector) <= 40),
  city text check (char_length(city) <= 60),
  bio text check (char_length(bio) <= 600),
  fund_role text check (char_length(fund_role) <= 120),
  linkedin_url text check (char_length(linkedin_url) <= 200),
  open_to public.request_type[] not null default '{}',
  monthly_cap int not null default 3 check (monthly_cap between 0 and 20),
  created_at timestamptz not null default now()
);
create index profiles_role_status_idx on public.profiles (role, status);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null,
  name text check (name ~ '^[a-z0-9-]{2,40}$'),
  description text check (char_length(description) <= 140),
  audience public.audience not null default 'alumni' check (audience in ('alumni', 'all')),
  from_request boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check ((kind = 'channel') = (name is not null))
);
create unique index conversations_channel_name_idx on public.conversations (name) where kind = 'channel';

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  alum_id uuid not null references public.profiles (id) on delete cascade,
  type public.request_type not null,
  topic text not null check (char_length(topic) between 1 and 120),
  message text not null check (char_length(message) between 1 and 500),
  availability text not null default 'Flexible' check (char_length(availability) <= 40),
  status public.request_status not null default 'pending',
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index requests_one_pending_per_pair_idx on public.requests (requester_id, alum_id) where status = 'pending';
create index requests_alum_idx on public.requests (alum_id, status);
create index requests_requester_idx on public.requests (requester_id, status);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 2000),
  location text check (char_length(location) <= 160),
  starts_at timestamptz not null,
  ends_at timestamptz,
  audience public.audience not null default 'all',
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index events_starts_at_idx on public.events (starts_at);

create table public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Who am I? Helpers used by the access rules below.
-- ---------------------------------------------------------------------------
create function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved');
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'approved' and p.is_admin);
$$;

create function public.my_role() returns public.member_role
language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.status = 'approved';
$$;

create function public.can_see_audience(a public.audience) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved() and (
    a = 'all'
    or public.is_admin()
    or (a = 'alumni' and public.my_role() = 'alumni')
    or (a = 'members' and public.my_role() = 'member')
  );
$$;

-- Channels: alumni channels are for alumni only (admins who are current members cannot read them).
-- Direct messages: only the two people in them.
create function public.can_access_conversation(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved() and exists (
    select 1 from public.conversations c
    where c.id = cid and (
      (c.kind = 'channel' and (c.audience = 'all' or public.my_role() = 'alumni'))
      or (c.kind = 'dm' and exists (
        select 1 from public.conversation_members m
        where m.conversation_id = c.id and m.user_id = auth.uid()
      ))
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- New accounts: create a profile. The very first account becomes an approved admin.
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  first_user boolean;
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, full_name, role, grad_year, status, is_admin)
  values (
    new.id,
    left(coalesce(nullif(trim(meta ->> 'full_name'), ''), split_part(new.email, '@', 1), 'New user'), 80),
    case when meta ->> 'role' = 'alumni' then 'alumni'::public.member_role else 'member'::public.member_role end,
    case when (meta ->> 'grad_year') ~ '^(19[5-9][0-9]|20[0-9][0-9])$' then (meta ->> 'grad_year')::int end,
    case when first_user then 'approved'::public.account_status else 'pending'::public.account_status end,
    first_user
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------
create function public.admin_list_users()
returns table (
  id uuid, email text, full_name text, role public.member_role, status public.account_status,
  is_admin boolean, grad_year int, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.role, p.status, p.is_admin, p.grad_year, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

create function public.admin_update_user(
  p_user uuid,
  p_status public.account_status default null,
  p_role public.member_role default null,
  p_is_admin boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_user = auth.uid() and (p_is_admin = false or p_status in ('pending', 'rejected')) then
    raise exception 'You cannot remove your own admin access';
  end if;
  update public.profiles p set
    status = coalesce(p_status, p.status),
    role = coalesce(p_role, p.role),
    is_admin = coalesce(p_is_admin, p.is_admin)
  where p.id = p_user;
end;
$$;

-- Yearly rollover: move every current member with this class year to alumni.
create function public.admin_graduate_class(p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare moved int;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update public.profiles p set role = 'alumni' where p.role = 'member' and p.grad_year = p_year;
  get diagnostics moved = row_count;
  return moved;
end;
$$;

-- ---------------------------------------------------------------------------
-- Requests (member -> alum)
-- ---------------------------------------------------------------------------
create function public.expire_stale_requests() returns void
language sql security definer set search_path = public as $$
  update public.requests r set status = 'expired', responded_at = now()
  where r.status = 'pending' and r.created_at < now() - interval '14 days';
$$;

-- Requests this alum has accepted in the current calendar month.
create function public.slots_used(p_alum uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.requests r
  where r.alum_id = p_alum and r.status = 'accepted'
    and r.responded_at >= date_trunc('month', now());
$$;

-- The same count for every alum at once, for the directory.
create function public.alumni_slots_used() returns table (alum_id uuid, used int)
language sql stable security definer set search_path = public as $$
  select r.alum_id, count(*)::int
  from public.requests r
  where public.is_approved() and r.status = 'accepted'
    and r.responded_at >= date_trunc('month', now())
  group by r.alum_id;
$$;

-- Internal: find or create the private thread between two people.
create function public.get_or_create_dm(p_a uuid, p_b uuid, p_from_request boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare conv uuid;
begin
  select c.id into conv
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = p_a
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = p_b
  where c.kind = 'dm'
  limit 1;

  if conv is null then
    insert into public.conversations (kind, from_request, created_by)
    values ('dm', p_from_request, auth.uid()) returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, p_a), (conv, p_b);
  elsif p_from_request then
    update public.conversations c set from_request = true where c.id = conv;
  end if;
  return conv;
end;
$$;

create function public.create_request(
  p_alum uuid,
  p_type public.request_type,
  p_topic text,
  p_message text,
  p_availability text default 'Flexible'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  alum public.profiles;
  open_count int;
  new_id uuid;
begin
  select * into me from public.profiles p where p.id = auth.uid();
  if me.id is null or me.status <> 'approved' then
    raise exception 'Your account has not been approved yet';
  end if;
  if me.role <> 'member' then
    raise exception 'Only current members can send requests';
  end if;

  select * into alum from public.profiles p
  where p.id = p_alum and p.status = 'approved' and p.role = 'alumni';
  if alum.id is null then raise exception 'That alum was not found'; end if;
  if not (p_type = any (alum.open_to)) then
    raise exception 'This alum is not offering that right now';
  end if;

  perform public.expire_stale_requests();

  select count(*) into open_count from public.requests r
  where r.requester_id = me.id and r.status = 'pending';
  if open_count >= 3 then
    raise exception 'You already have 3 open requests. Wait for a reply or cancel one first.';
  end if;

  if exists (select 1 from public.requests r
             where r.requester_id = me.id and r.alum_id = p_alum and r.status = 'pending') then
    raise exception 'You already have a pending request with this alum';
  end if;

  if public.slots_used(p_alum) >= alum.monthly_cap then
    raise exception 'This alum is at capacity this month';
  end if;

  insert into public.requests (requester_id, alum_id, type, topic, message, availability)
  values (me.id, p_alum, p_type, trim(p_topic), trim(p_message), coalesce(nullif(trim(p_availability), ''), 'Flexible'))
  returning id into new_id;
  return new_id;
end;
$$;

-- The alum accepts or declines. Accepting opens a private thread and returns its id.
create function public.respond_to_request(p_request uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.requests;
  conv uuid;
begin
  select * into r from public.requests q where q.id = p_request for update;
  if r.id is null or r.alum_id <> auth.uid() then raise exception 'Request not found'; end if;
  if not public.is_approved() then raise exception 'Your account has not been approved yet'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been handled'; end if;

  if r.created_at < now() - interval '14 days' then
    update public.requests q set status = 'expired', responded_at = now() where q.id = r.id;
    return null;
  end if;

  if not p_accept then
    update public.requests q set status = 'declined', responded_at = now() where q.id = r.id;
    return null;
  end if;

  conv := public.get_or_create_dm(r.requester_id, r.alum_id, true);
  update public.requests q
    set status = 'accepted', responded_at = now(), conversation_id = conv
  where q.id = r.id;
  -- Start the thread with the member's request so both sides have the context.
  insert into public.messages (conversation_id, sender_id, body)
  values (conv, r.requester_id, r.topic || E'\n\n' || r.message);
  return conv;
end;
$$;

create function public.cancel_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.requests r set status = 'cancelled', responded_at = now()
  where r.id = p_request and r.requester_id = auth.uid() and r.status = 'pending';
  if not found then raise exception 'Request not found or already handled'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
-- Alumni can message each other directly. Members reach alumni through requests.
create function public.start_dm(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if p_other = auth.uid() then raise exception 'You cannot message yourself'; end if;
  if public.my_role() is distinct from 'alumni' then
    raise exception 'Direct messages are for alumni. Members can send a request instead.';
  end if;
  if not exists (select 1 from public.profiles p
                 where p.id = p_other and p.status = 'approved' and p.role = 'alumni') then
    raise exception 'That person was not found';
  end if;
  return public.get_or_create_dm(auth.uid(), p_other, false);
end;
$$;

create function public.mark_read(p_conversation uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_conversation(p_conversation) then return; end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

-- Everything the Chat tab needs in one call.
create function public.my_conversations()
returns table (
  id uuid, kind public.conversation_kind, name text, description text, audience public.audience,
  from_request boolean, other_id uuid, other_name text,
  last_body text, last_sender text, last_at timestamptz, unread int
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.kind, c.name, c.description, c.audience, c.from_request,
    o.id, o.full_name,
    lm.body, lm.sender_name, lm.created_at,
    (select count(*)::int from public.messages m
       where m.conversation_id = c.id
         and m.sender_id <> auth.uid()
         and m.created_at > coalesce(rd.last_read_at, '-infinity'::timestamptz))
  from public.conversations c
  left join public.conversation_reads rd
    on rd.conversation_id = c.id and rd.user_id = auth.uid()
  left join lateral (
    select m.body, p.full_name as sender_name, m.created_at
    from public.messages m join public.profiles p on p.id = m.sender_id
    where m.conversation_id = c.id
    order by m.created_at desc limit 1
  ) lm on true
  left join lateral (
    select p.id, p.full_name
    from public.conversation_members cm join public.profiles p on p.id = cm.user_id
    where cm.conversation_id = c.id and cm.user_id <> auth.uid()
    limit 1
  ) o on c.kind = 'dm'
  where public.can_access_conversation(c.id)
  order by (c.kind = 'channel') desc, c.name, lm.created_at desc nulls last;
$$;

create function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations c set last_message_at = new.created_at where c.id = new.conversation_id;
  return new;
end;
$$;

create trigger on_message_created
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------------
-- Access rules (row level security)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.messages enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;

-- Profiles: you see your own; approved people see other approved people; admins see everyone.
create policy "profiles: read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or (status = 'approved' and public.is_approved()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Requests: only the two people involved can read them. All changes go through the functions above.
create policy "requests: read own" on public.requests for select to authenticated
  using (requester_id = auth.uid() or alum_id = auth.uid());

-- Conversations: admins can see and manage the list of channels, but not read alumni-only messages.
create policy "conversations: read" on public.conversations for select to authenticated
  using (public.can_access_conversation(id) or (kind = 'channel' and public.is_admin()));
create policy "conversations: admins create channels" on public.conversations for insert to authenticated
  with check (kind = 'channel' and public.is_admin());
create policy "conversations: admins delete channels" on public.conversations for delete to authenticated
  using (kind = 'channel' and public.is_admin());

create policy "members: read own" on public.conversation_members for select to authenticated
  using (user_id = auth.uid());

create policy "messages: read" on public.messages for select to authenticated
  using (public.can_access_conversation(conversation_id));
create policy "messages: send" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_access_conversation(conversation_id));

-- Events: visible by audience. Alumni and admins can post. The poster or an admin can edit or delete.
create policy "events: read" on public.events for select to authenticated
  using (public.can_see_audience(audience) or created_by = auth.uid());
create policy "events: post" on public.events for insert to authenticated
  with check (created_by = auth.uid() and public.is_approved()
              and (public.is_admin() or public.my_role() = 'alumni'));
create policy "events: edit" on public.events for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
create policy "events: delete" on public.events for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

create policy "rsvps: read" on public.event_rsvps for select to authenticated
  using (public.is_approved());
create policy "rsvps: add own" on public.event_rsvps for insert to authenticated
  with check (user_id = auth.uid() and public.is_approved()
              and exists (select 1 from public.events e where e.id = event_id));
create policy "rsvps: remove own" on public.event_rsvps for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Permissions. Signed-out visitors get nothing. Signed-in users get only what the app needs.
-- People cannot change their own role, status or admin flag: those columns are not granted.
-- ---------------------------------------------------------------------------
revoke all on table
  public.profiles, public.requests, public.conversations, public.conversation_members,
  public.conversation_reads, public.messages, public.events, public.event_rsvps
from anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, grad_year, headline, company, sector, city, bio, fund_role, linkedin_url, open_to, monthly_cap)
  on public.profiles to authenticated;
grant select on public.requests to authenticated;
grant select, insert, delete on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, delete on public.event_rsvps to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_approved(), public.is_admin(), public.my_role(),
  public.can_see_audience(public.audience), public.can_access_conversation(uuid),
  public.admin_list_users(),
  public.admin_update_user(uuid, public.account_status, public.member_role, boolean),
  public.admin_graduate_class(int),
  public.expire_stale_requests(), public.slots_used(uuid), public.alumni_slots_used(),
  public.create_request(uuid, public.request_type, text, text, text),
  public.respond_to_request(uuid, boolean), public.cancel_request(uuid),
  public.start_dm(uuid), public.mark_read(uuid), public.my_conversations()
to authenticated;

-- ---------------------------------------------------------------------------
-- Live chat: send new messages to open threads in real time.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when undefined_object then
  raise notice 'supabase_realtime publication not found; skipping';
end;
$$;

-- ---------------------------------------------------------------------------
-- Starter channels. Add city and class-year channels from the Admin page.
-- ---------------------------------------------------------------------------
insert into public.conversations (kind, name, description, audience, created_by) values
  ('channel', 'general', 'Open conversation for all alumni', 'alumni', null),
  ('channel', 'markets', 'Market talk and ideas', 'alumni', null),
  ('channel', 'jobs-and-referrals', 'Openings, referrals and career moves', 'alumni', null),
  ('channel', 'ask-alumni', 'Current members can post questions here', 'all', null);
