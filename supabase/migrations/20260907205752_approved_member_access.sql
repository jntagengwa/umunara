-- Serialize every registration write on its event, including direct PostgREST writes.
create function private.enforce_event_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.events;
  registration_count bigint;
begin
  if not private.has_minimum_role('member') then
    raise exception 'Membership approval is required.' using errcode = '42501';
  end if;
  if new.profile_id <> auth.uid() and not private.has_minimum_role('editor') then
    raise exception 'Permission denied.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = new.profile_id and role in ('member', 'editor', 'admin') and approved_at is not null
  ) then
    raise exception 'Membership approval is required.' using errcode = '42501';
  end if;

  select * into target_event from public.events where id = new.event_id for update;
  if not found or target_event.status <> 'published' or target_event.visibility not in ('public', 'member') then
    raise exception 'Event is unavailable.' using errcode = '42501';
  end if;
  if new.status = 'registered' and target_event.capacity is not null then
    select count(*) into registration_count from public.event_registrations
    where event_id = new.event_id and status = 'registered'
      and id <> new.id and profile_id <> new.profile_id;
    if registration_count >= target_event.capacity then
      raise exception 'Event capacity reached.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_event_registration() from public, anon, authenticated;
create trigger event_registrations_enforce_capacity
  before insert or update on public.event_registrations
  for each row execute function private.enforce_event_registration();

-- The public RPC runs with the caller's permissions and RLS; the private trigger
-- performs the locked capacity check with visibility of all registrations.
create function public.register_for_event(target_event_id uuid)
returns public.event_registrations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  registration public.event_registrations;
begin
  if not private.has_minimum_role('member') then
    raise exception 'Membership approval is required.' using errcode = '42501';
  end if;
  insert into public.event_registrations (event_id, profile_id)
  values (target_event_id, auth.uid())
  on conflict (event_id, profile_id) do update set status = 'registered'
  returning * into registration;
  return registration;
end;
$$;
revoke all on function public.register_for_event(uuid) from public, anon;
grant execute on function public.register_for_event(uuid) to authenticated;

insert into storage.buckets (id, name, public) values ('resources', 'resources', false);
create policy "resources: approved members download published files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resources'
    and (select private.has_minimum_role('member'))
    and exists (
      select 1 from public.resources
      where storage_path = storage.objects.name
        and status = 'published' and visibility in ('public', 'member')
    )
  );
