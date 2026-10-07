-- PCM Alumni Network: mentors
-- Run this once, after schema.sql, in the same project: SQL Editor > New query > paste > Run.
--
-- Mentors are people who were never part of the fund but help mentor
-- students. They get exactly the same permissions, restrictions, and
-- settings as alumni (requests, chat, events, directory, open_to,
-- monthly_cap, everything) because under the hood they ARE stored with
-- role = 'alumni' -- is_mentor is purely a label on top, so none of the
-- existing RLS policies or functions need to change.

alter table public.profiles add column is_mentor boolean not null default false;

-- Picks up the extra signup choice ("mentor") and records it as
-- role = 'alumni', is_mentor = true.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  first_user boolean;
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, full_name, role, grad_year, status, is_admin, is_mentor)
  values (
    new.id,
    left(coalesce(nullif(trim(meta ->> 'full_name'), ''), split_part(new.email, '@', 1), 'New user'), 80),
    case when meta ->> 'role' in ('alumni', 'mentor') then 'alumni'::public.member_role else 'member'::public.member_role end,
    case when (meta ->> 'grad_year') ~ '^(19[5-9][0-9]|20[0-9][0-9])$' then (meta ->> 'grad_year')::int end,
    case when first_user then 'approved'::public.account_status else 'pending'::public.account_status end,
    first_user,
    meta ->> 'role' = 'mentor'
  );
  return new;
end;
$$;

-- Dropped and recreated (rather than CREATE OR REPLACE) because adding a
-- parameter changes the function's identity, not just its body.
drop function public.admin_update_user(uuid, public.account_status, public.member_role, boolean);

create function public.admin_update_user(
  p_user uuid,
  p_status public.account_status default null,
  p_role public.member_role default null,
  p_is_admin boolean default null,
  p_is_mentor boolean default null
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
    is_admin = coalesce(p_is_admin, p.is_admin),
    is_mentor = coalesce(p_is_mentor, p.is_mentor)
  where p.id = p_user;
end;
$$;

-- Dropped and recreated because adding a return column changes the
-- function's return type, which CREATE OR REPLACE cannot do.
drop function public.admin_list_users();

create function public.admin_list_users()
returns table (
  id uuid, email text, full_name text, role public.member_role, status public.account_status,
  is_admin boolean, is_mentor boolean, grad_year int, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.role, p.status, p.is_admin, p.is_mentor, p.grad_year, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;
grant execute on function
  public.admin_update_user(uuid, public.account_status, public.member_role, boolean, boolean)
to authenticated;
