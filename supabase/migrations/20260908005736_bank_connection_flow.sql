-- Durable connection-specific scheduling only; the worker/claim flow belongs to Task 3.
create table public.bank_sync_requests (
  connection_id uuid primary key references public.bank_connections(id) on delete restrict,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.bank_sync_requests enable row level security;
revoke all on public.bank_sync_requests from public, anon, authenticated, service_role;
grant select on public.bank_sync_requests to service_role;
create index bank_sync_requests_pending_idx on public.bank_sync_requests(requested_at) where completed_at is null;
create trigger bank_sync_requests_no_delete before delete on public.bank_sync_requests
  for each row execute function private.reject_bank_delete();

create function private.create_bank_connection(connection_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account jsonb;
  connection_id uuid;
  actor_id uuid;
begin
  if jsonb_typeof(connection_input) is distinct from 'object'
    or not (connection_input ?& array['connectionId', 'actorId', 'secretReference', 'institutionName', 'accounts'])
    or (connection_input - array['connectionId', 'actorId', 'secretReference', 'institutionName', 'accounts']) <> '{}'::jsonb
    or jsonb_typeof(connection_input->'connectionId') is distinct from 'string'
    or jsonb_typeof(connection_input->'actorId') is distinct from 'string'
    or jsonb_typeof(connection_input->'secretReference') is distinct from 'string'
    or jsonb_typeof(connection_input->'institutionName') is distinct from 'string'
    or jsonb_typeof(connection_input->'accounts') is distinct from 'array' then
    raise exception 'Invalid bank connection.' using errcode = '22023';
  end if;
  if jsonb_array_length(connection_input->'accounts') not between 1 and 100 then
    raise exception 'Invalid bank account selection.' using errcode = '22023';
  end if;
  connection_id := (connection_input->>'connectionId')::uuid;
  actor_id := (connection_input->>'actorId')::uuid;
  -- This actor is supplied exclusively by the authenticated server, never browser input.
  -- Lock approval through commit so a concurrent role change cannot authorize a stale write.
  perform 1 from public.profiles where id = actor_id and role = 'admin' and approved_at is not null for share;
  if not found then raise exception 'Administrator approval required.' using errcode = '42501'; end if;
  insert into public.bank_connections(id, institution_name, authorized_by)
    values(connection_id, connection_input->>'institutionName', actor_id);
  insert into private.bank_connection_secrets(connection_id, secret_reference)
    values(connection_id, (connection_input->>'secretReference')::uuid);
  for account in select value from jsonb_array_elements(connection_input->'accounts') loop
    if jsonb_typeof(account) is distinct from 'object'
      or not (account ?& array['providerAccountId', 'name', 'mask', 'type', 'subtype', 'currency'])
      or (account - array['providerAccountId', 'name', 'mask', 'type', 'subtype', 'currency']) <> '{}'::jsonb
      or jsonb_typeof(account->'providerAccountId') is distinct from 'string'
      or jsonb_typeof(account->'name') is distinct from 'string'
      or jsonb_typeof(account->'mask') not in ('string', 'null')
      or jsonb_typeof(account->'type') is distinct from 'string'
      or jsonb_typeof(account->'subtype') is distinct from 'string'
      or jsonb_typeof(account->'currency') is distinct from 'string' then
      raise exception 'Invalid bank account.' using errcode = '22023';
    end if;
    insert into public.bank_accounts(connection_id, provider_account_id, name, mask, type, subtype, currency)
      values(connection_id, account->>'providerAccountId', account->>'name', account->>'mask', account->>'type', account->>'subtype', account->>'currency');
  end loop;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
    values(actor_id, 'bank.connection.created', 'bank_connection', connection_id,
      jsonb_build_object('businessAccountConsent', true, 'countryCode', 'US', 'accountCount', jsonb_array_length(connection_input->'accounts')));
  insert into public.bank_sync_requests(connection_id) values(connection_id);
  return jsonb_build_object('id', connection_id, 'institutionName', connection_input->>'institutionName', 'status', 'active', 'lastSyncedAt', null);
end;
$$;
create function public.create_bank_connection(connection_input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.create_bank_connection(connection_input);
$$;
revoke all on function private.create_bank_connection(jsonb), public.create_bank_connection(jsonb) from public, anon, authenticated;
grant execute on function private.create_bank_connection(jsonb), public.create_bank_connection(jsonb) to service_role;
