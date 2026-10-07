-- PCM Alumni Network: email notifications
-- Run this once, after schema.sql, in the same project: SQL Editor > New query > paste > Run.
--
-- What this adds:
--   * A webhook call whenever a request is created or accepted, so the app
--     (deployed on Vercel) can send the matching email.
--   * A function the weekly digest cron uses to count unread messages for any user.
--
-- Before running: replace the two values in the insert below.
--   webhook_url    the deployed app's notify endpoint, e.g. https://your-app.vercel.app/api/notify
--   webhook_secret must match the NOTIFY_WEBHOOK_SECRET environment variable on Vercel

create extension if not exists pg_net;

create table if not exists public.app_config (
  key text primary key,
  value text not null
);
revoke all on public.app_config from anon, authenticated;

insert into public.app_config (key, value) values
  ('webhook_url', 'https://pcm-alumni-network.vercel.app/api/notify'),
  ('webhook_secret', 'REPLACE_WITH_NOTIFY_WEBHOOK_SECRET')
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- Fire-and-forget webhook call. Runs inside the same transaction as the
-- request insert/update but pg_net queues the HTTP call asynchronously, so it
-- never blocks or fails the request itself.
-- ---------------------------------------------------------------------------
create function public.notify_webhook(p_event text, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  url text;
  secret text;
begin
  select value into url from public.app_config where key = 'webhook_url';
  select value into secret from public.app_config where key = 'webhook_secret';
  if url is null or url = '' then return; end if;

  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret),
    body := jsonb_build_object('event', p_event, 'payload', p_payload)
  );
end;
$$;

create function public.on_request_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_webhook('request_created', jsonb_build_object('request_id', new.id));
  return new;
end;
$$;

create trigger request_created_notify
  after insert on public.requests
  for each row execute function public.on_request_created();

create function public.on_request_accepted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.notify_webhook('request_accepted', jsonb_build_object('request_id', new.id));
  end if;
  return new;
end;
$$;

create trigger request_accepted_notify
  after update on public.requests
  for each row execute function public.on_request_accepted();

-- ---------------------------------------------------------------------------
-- Unread message count for any user, for the weekly digest. Mirrors
-- can_access_conversation() in schema.sql but takes a user id instead of
-- relying on auth.uid(), since the digest runs with the service role key.
-- ---------------------------------------------------------------------------
create function public.unread_count_for_user(p_user uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  u_role public.member_role;
  u_status public.account_status;
  total int;
begin
  select role, status into u_role, u_status from public.profiles where id = p_user;
  if u_status is distinct from 'approved' then return 0; end if;

  select coalesce(count(*), 0)::int into total
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.conversation_reads rd on rd.conversation_id = c.id and rd.user_id = p_user
  where m.sender_id <> p_user
    and m.created_at > coalesce(rd.last_read_at, '-infinity'::timestamptz)
    and (
      (c.kind = 'channel' and (c.audience = 'all' or u_role = 'alumni'))
      or (c.kind = 'dm' and exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = c.id and cm.user_id = p_user
      ))
    );

  return total;
end;
$$;

grant execute on function public.unread_count_for_user(uuid) to service_role;
