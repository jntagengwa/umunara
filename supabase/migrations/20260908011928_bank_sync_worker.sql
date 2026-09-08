-- No plaintext Item IDs, tokens, webhook bodies or provider pages are retained.
alter table private.bank_connection_secrets add column item_fingerprint text unique
  check (item_fingerprint ~ '^[a-f0-9]{64}$');
alter table public.bank_sync_requests
  add column requested_version bigint not null default 1 check (requested_version > 0),
  add column completed_version bigint not null default 0 check (completed_version >= 0),
  add column claimed_version bigint,
  add column claimed_at timestamptz,
  add column lease_id uuid,
  add column lease_expires_at timestamptz,
  add column cycle_id uuid,
  add column cycle_start_cursor public.bank_cursor,
  add column restart_required boolean not null default false;

create function private.claim_bank_sync(connection uuid, lease uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.bank_connections; job public.bank_sync_requests; secret private.bank_connection_secrets;
begin
  if connection is null or lease is null then raise exception 'Invalid sync request.' using errcode = '22023'; end if;
  select * into c from public.bank_connections where id = connection for update;
  if not found or c.status <> 'active' then return jsonb_build_object('outcome', 'idle'); end if;
  select * into job from public.bank_sync_requests where connection_id = connection for update;
  if not found or job.completed_version >= job.requested_version then return jsonb_build_object('outcome', 'idle'); end if;
  if job.lease_expires_at > clock_timestamp() then return jsonb_build_object('outcome', 'busy'); end if;
  if job.cycle_id is null then
    job.cycle_id := gen_random_uuid();
    job.cycle_start_cursor := c.sync_cursor;
    job.claimed_version := job.requested_version;
    job.claimed_at := clock_timestamp();
  elsif job.restart_required or job.lease_id is not null then
    -- An interrupted pagination attempt must restart at its durable original cursor.
    -- Already applied rows remain; the atomic page RPC idempotently reapplies snapshots.
    c.sync_cursor := job.cycle_start_cursor;
    job.cycle_id := gen_random_uuid();
    update public.bank_connections set sync_cursor = c.sync_cursor where id = connection;
  end if;
  update public.bank_sync_requests set lease_id = lease, lease_expires_at = clock_timestamp() + interval '70 seconds',
    cycle_id = job.cycle_id, cycle_start_cursor = job.cycle_start_cursor,
    claimed_version = job.claimed_version, claimed_at = job.claimed_at, restart_required = false
    where connection_id = connection;
  select * into strict secret from private.bank_connection_secrets where connection_id = connection;
  return jsonb_build_object('outcome', 'ready', 'connectionId', connection, 'actorId', c.authorized_by,
    'secretReference', secret.secret_reference, 'cursor', c.sync_cursor, 'cycleId', job.cycle_id,
    'accounts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'providerAccountId', provider_account_id, 'currency', currency) order by id), '[]'::jsonb)
      from public.bank_accounts where connection_id = connection and archived_at is null));
end;
$$;

-- Lease checks live inside each page transaction so an expired worker cannot race a successor.
create function private.require_bank_sync_lease(connection uuid, lease uuid)
returns public.bank_sync_requests language plpgsql security definer set search_path = '' as $$
declare job public.bank_sync_requests;
begin
  perform 1 from public.bank_connections where id = connection and status = 'active' for update;
  if not found then raise exception 'Inactive bank connection.' using errcode = '40001'; end if;
  select * into job from public.bank_sync_requests where connection_id = connection for update;
  if not found or lease is null or job.lease_id is distinct from lease or job.lease_expires_at <= clock_timestamp()
    or job.lease_expires_at is null or job.cycle_id is null then
    raise exception 'Bank sync lease expired.' using errcode = '40001';
  end if;
  return job;
end;
$$;

create function private.bind_bank_sync_item(connection uuid, lease uuid, fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_bank_sync_lease(connection, lease);
  if fingerprint is null or fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid Item fingerprint.' using errcode = '22023'; end if;
  update private.bank_connection_secrets set item_fingerprint = fingerprint where connection_id = connection
    and (item_fingerprint is null or item_fingerprint = fingerprint);
  if not found then raise exception 'Bank Item identity changed.' using errcode = '22023'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function private.save_bank_worker_page(worker_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job public.bank_sync_requests; result jsonb; connection uuid; lease uuid; page jsonb;
begin
  if jsonb_typeof(worker_input) is distinct from 'object'
    or not (worker_input ?& array['page', 'leaseId', 'hasMore'])
    or (worker_input - array['page', 'leaseId', 'hasMore']) <> '{}'::jsonb
    or jsonb_typeof(worker_input->'page') is distinct from 'object'
    or jsonb_typeof(worker_input->'leaseId') is distinct from 'string'
    or jsonb_typeof(worker_input->'hasMore') is distinct from 'boolean' then
    raise exception 'Invalid worker page.' using errcode = '22023';
  end if;
  page := worker_input->'page'; connection := (page->>'connectionId')::uuid; lease := (worker_input->>'leaseId')::uuid;
  perform 1 from public.bank_connections where id = connection for update;
  select * into job from public.bank_sync_requests where connection_id = connection for update;
  -- A lost final response can be replayed after cycle completion, but only by its lease.
  if job.lease_id = lease and exists(select 1 from public.bank_sync_pages where id = (page->>'pageId')::uuid and connection_id = connection) then
    return private.save_bank_sync_page(page);
  end if;
  job := private.require_bank_sync_lease(connection, lease);
  if (worker_input->>'hasMore')::boolean and page->>'cursor' is not distinct from page->>'expectedCursor' then
    raise exception 'Non-advancing pagination.' using errcode = '22023';
  end if;
  result := private.save_bank_sync_page(page);
  if (worker_input->>'hasMore')::boolean then
    update public.bank_sync_requests set lease_expires_at = clock_timestamp() + interval '70 seconds' where connection_id = connection;
  else
    update public.bank_sync_requests set completed_version = job.claimed_version,
      completed_at = case when requested_version = job.claimed_version then clock_timestamp() else null end,
      cycle_id = null, cycle_start_cursor = null, restart_required = false, lease_expires_at = null
      where connection_id = connection;
    update public.bank_webhook_events set processed_at = clock_timestamp()
      where connection_id = connection and processed_at is null and received_at <= job.claimed_at;
  end if;
  return result;
end;
$$;

create function private.restart_bank_sync(connection uuid, lease uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job public.bank_sync_requests; next_cycle uuid := gen_random_uuid();
begin
  job := private.require_bank_sync_lease(connection, lease);
  update public.bank_connections set sync_cursor = job.cycle_start_cursor where id = connection;
  update public.bank_sync_requests set cycle_id = next_cycle, restart_required = false,
    lease_expires_at = clock_timestamp() + interval '70 seconds' where connection_id = connection;
  return jsonb_build_object('cursor', job.cycle_start_cursor, 'cycleId', next_cycle);
end;
$$;

create function private.release_bank_sync(connection uuid, lease uuid, disposition text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_bank_sync_lease(connection, lease);
  if disposition is null or disposition not in ('continue', 'retry', 'reauthorization_required', 'disconnected') then
    raise exception 'Invalid sync disposition.' using errcode = '22023';
  end if;
  update public.bank_sync_requests set lease_id = null, lease_expires_at = null,
    restart_required = disposition <> 'continue' where connection_id = connection;
  if disposition in ('reauthorization_required', 'disconnected') then
    update public.bank_connections set status = disposition, updated_at = clock_timestamp() where id = connection;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function private.enqueue_bank_webhook(fingerprint text, deduplication_key text, event_type text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare connection uuid;
begin
  if fingerprint is null or fingerprint !~ '^[a-f0-9]{64}$' or deduplication_key is null or deduplication_key !~ '^[a-f0-9]{64}$'
    or event_type is distinct from 'TRANSACTIONS.SYNC_UPDATES_AVAILABLE' then
    raise exception 'Invalid verified webhook.' using errcode = '22023';
  end if;
  select connection_id into connection from private.bank_connection_secrets where item_fingerprint = fingerprint;
  -- Unknown Items have no authorized connection. Initial requests predate Item indexing.
  if not found then return jsonb_build_object('ok', true); end if;
  perform 1 from public.bank_connections where id = connection and status = 'active' for update;
  if not found then return jsonb_build_object('ok', true); end if;
  insert into public.bank_webhook_events(connection_id, deduplication_key, event_type)
    values(connection, deduplication_key, event_type) on conflict do nothing;
  if found then
    update public.bank_sync_requests set requested_version = requested_version + 1,
      requested_at = clock_timestamp(), completed_at = null where connection_id = connection;
    if not found then raise exception 'Missing bank sync request.' using errcode = '22023'; end if;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.claim_bank_sync(connection uuid, lease uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.claim_bank_sync(connection, lease); $$;
create function public.bind_bank_sync_item(connection uuid, lease uuid, fingerprint text) returns jsonb language sql security invoker set search_path = '' as $$ select private.bind_bank_sync_item(connection, lease, fingerprint); $$;
create function public.save_bank_worker_page(worker_input jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select private.save_bank_worker_page(worker_input); $$;
create function public.restart_bank_sync(connection uuid, lease uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.restart_bank_sync(connection, lease); $$;
create function public.release_bank_sync(connection uuid, lease uuid, disposition text) returns jsonb language sql security invoker set search_path = '' as $$ select private.release_bank_sync(connection, lease, disposition); $$;
create function public.enqueue_bank_webhook(fingerprint text, deduplication_key text, event_type text) returns jsonb language sql security invoker set search_path = '' as $$ select private.enqueue_bank_webhook(fingerprint, deduplication_key, event_type); $$;

revoke all on function private.require_bank_sync_lease(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.claim_bank_sync(uuid, uuid), public.claim_bank_sync(uuid, uuid),
  private.bind_bank_sync_item(uuid, uuid, text), public.bind_bank_sync_item(uuid, uuid, text),
  private.save_bank_worker_page(jsonb), public.save_bank_worker_page(jsonb),
  private.restart_bank_sync(uuid, uuid), public.restart_bank_sync(uuid, uuid),
  private.release_bank_sync(uuid, uuid, text), public.release_bank_sync(uuid, uuid, text),
  private.enqueue_bank_webhook(text, text, text), public.enqueue_bank_webhook(text, text, text)
  from public, anon, authenticated;
grant execute on function private.claim_bank_sync(uuid, uuid), public.claim_bank_sync(uuid, uuid),
  private.bind_bank_sync_item(uuid, uuid, text), public.bind_bank_sync_item(uuid, uuid, text),
  private.save_bank_worker_page(jsonb), public.save_bank_worker_page(jsonb),
  private.restart_bank_sync(uuid, uuid), public.restart_bank_sync(uuid, uuid),
  private.release_bank_sync(uuid, uuid, text), public.release_bank_sync(uuid, uuid, text),
  private.enqueue_bank_webhook(text, text, text), public.enqueue_bank_webhook(text, text, text) to service_role;
