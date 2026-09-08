-- Server-owned bank persistence. No credentials or raw provider payloads belong here.
create domain public.bank_classification as text
  check (value in ('unreviewed', 'donation', 'non_donation', 'processor_payout'));
create domain public.bank_identifier as text check (length(value) between 1 and 255 and value = btrim(value));
create domain public.bank_cursor as text check (length(value) between 1 and 4096);
create domain public.bank_minor_units as bigint check (value between -9007199254740991 and 9007199254740991);

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  institution_name text not null check (length(btrim(institution_name)) between 1 and 200),
  authorized_by uuid not null references public.profiles(id) on delete restrict,
  country_code text not null default 'US' check (country_code = 'US'),
  status text not null default 'active' check (status in ('active', 'reauthorization_required', 'disconnected')),
  sync_cursor public.bank_cursor,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- UUID points to an external server-only secret bundle containing encrypted item/access
-- identifiers. Provisioning, encryption and resolution belong to the connection task.
create table private.bank_connection_secrets (
  connection_id uuid primary key references public.bank_connections(id) on delete restrict,
  secret_reference uuid not null unique,
  created_at timestamptz not null default now()
);
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.bank_connections(id) on delete restrict,
  provider_account_id public.bank_identifier not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  mask text check (mask ~ '^[0-9]{2,4}$'),
  type text not null default 'depository' check (type = 'depository'),
  subtype text not null check (subtype in ('checking', 'savings')),
  currency public.donation_currency not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (connection_id, provider_account_id),
  unique (id, connection_id, currency)
);
create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.bank_connections(id) on delete restrict,
  account_id uuid not null,
  provider_transaction_id public.bank_identifier not null,
  -- Positive credits / negative debits, normalized by the future provider adapter.
  amount_minor public.bank_minor_units not null,
  currency public.donation_currency not null,
  booked_on date not null check (booked_on between date '2000-01-01' and date '9998-12-31'),
  description text not null check (length(btrim(description)) between 1 and 300),
  pending boolean not null,
  classification public.bank_classification not null default 'unreviewed',
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_transaction_id),
  foreign key (account_id, connection_id, currency) references public.bank_accounts(id, connection_id, currency) on delete restrict,
  check (classification in ('unreviewed', 'non_donation') or (amount_minor > 0 and not pending and removed_at is null))
);
create table public.bank_sync_pages (
  id uuid primary key,
  connection_id uuid not null references public.bank_connections(id) on delete restrict,
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  added integer not null check (added between 0 and 500),
  modified integer not null check (modified between 0 and 500),
  removed integer not null check (removed between 0 and 500),
  created_at timestamptz not null default now(),
  check (added + modified + removed <= 500)
);
-- Dedupe key must be a stable hash derived AFTER provider authenticity verification.
-- This table is only storage scaffolding; webhook ingestion/scheduling is a later task.
create table public.bank_webhook_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.bank_connections(id) on delete restrict,
  deduplication_key text not null check (deduplication_key ~ '^[a-f0-9]{64}$'),
  event_type public.bank_identifier not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (connection_id, deduplication_key)
);
create table public.reconciliation_links (
  id uuid primary key default gen_random_uuid(),
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete restrict,
  donation_id uuid not null references public.donations(id) on delete restrict,
  kind text not null check (kind in ('donation', 'processor_payout')),
  -- Historical allocation at matching time; later refunds do not rewrite a payout.
  matched_amount_minor public.bank_minor_units not null,
  currency public.donation_currency not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text check (revocation_reason in ('bank_transaction_changed', 'bank_transaction_removed')),
  check ((revoked_at is null) = (revocation_reason is null))
);
-- Each ledger gift has at most one active bank source. A payout may group gifts;
-- an offline gift has exactly one source/target, enforced by the atomic RPC.
create unique index reconciliation_one_donation_idx on public.reconciliation_links(donation_id) where revoked_at is null;
create unique index reconciliation_one_pair_idx on public.reconciliation_links(bank_transaction_id, donation_id) where revoked_at is null;
create unique index reconciliation_one_offline_source_idx on public.reconciliation_links(bank_transaction_id) where kind = 'donation' and revoked_at is null;
create index bank_transactions_review_idx on public.bank_transactions(booked_on desc, id) where removed_at is null;
create index bank_transactions_account_idx on public.bank_transactions(account_id, booked_on desc, id);
create index bank_transactions_classification_idx on public.bank_transactions(classification, booked_on desc, id) where removed_at is null;
create index bank_connections_actor_idx on public.bank_connections(authorized_by);
create index bank_sync_pages_connection_idx on public.bank_sync_pages(connection_id, created_at);
create index bank_webhook_pending_idx on public.bank_webhook_events(connection_id, received_at) where processed_at is null;
create index reconciliation_source_idx on public.reconciliation_links(bank_transaction_id);
create index reconciliation_actor_idx on public.reconciliation_links(created_by);

revoke all on public.bank_connections, public.bank_accounts, public.bank_transactions,
  public.bank_sync_pages, public.bank_webhook_events, public.reconciliation_links,
  private.bank_connection_secrets from public, anon, authenticated, service_role;
grant select on public.bank_connections, public.bank_accounts, public.bank_transactions,
  public.bank_sync_pages, public.bank_webhook_events, public.reconciliation_links,
  private.bank_connection_secrets to service_role;
alter table public.bank_connections enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_sync_pages enable row level security;
alter table public.bank_webhook_events enable row level security;
alter table public.reconciliation_links enable row level security;
alter table private.bank_connection_secrets enable row level security;
-- No browser policies: fail closed even if a future grant is accidentally added.

create function private.reject_bank_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Bank history cannot be deleted.' using errcode = '42501';
end;
$$;
create trigger bank_connections_no_delete before delete on public.bank_connections
  for each row execute function private.reject_bank_delete();
create trigger bank_accounts_no_delete before delete on public.bank_accounts
  for each row execute function private.reject_bank_delete();
create trigger bank_transactions_no_delete before delete on public.bank_transactions
  for each row execute function private.reject_bank_delete();
create trigger bank_sync_pages_immutable before update or delete on public.bank_sync_pages
  for each row execute function private.reject_bank_delete();
create trigger bank_webhook_events_no_delete before delete on public.bank_webhook_events
  for each row execute function private.reject_bank_delete();
create trigger reconciliation_links_no_delete before delete on public.reconciliation_links
  for each row execute function private.reject_bank_delete();
revoke all on function private.reject_bank_delete() from public, anon, authenticated, service_role;

create function private.save_bank_sync_page(page_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  connection public.bank_connections;
  receipt public.bank_sync_pages;
  snapshot jsonb;
  existing public.bank_transactions;
  removed_id text;
  fingerprint text;
  changes integer;
begin
  if jsonb_typeof(page_input) is distinct from 'object'
    or not (page_input ?& array['connectionId', 'pageId', 'expectedCursor', 'cursor', 'added', 'modified', 'removed'])
    or (page_input - array['connectionId', 'pageId', 'expectedCursor', 'cursor', 'added', 'modified', 'removed']) <> '{}'::jsonb
    or jsonb_typeof(page_input->'added') is distinct from 'array'
    or jsonb_typeof(page_input->'modified') is distinct from 'array'
    or jsonb_typeof(page_input->'removed') is distinct from 'array'
    or jsonb_typeof(page_input->'cursor') is distinct from 'string'
    or jsonb_typeof(page_input->'expectedCursor') not in ('string', 'null')
    or jsonb_typeof(page_input->'pageId') is distinct from 'string'
    or jsonb_typeof(page_input->'connectionId') is distinct from 'string' then
    raise exception 'Invalid bank sync page.' using errcode = '22023';
  end if;
  perform (page_input->>'cursor')::public.bank_cursor, (page_input->>'expectedCursor')::public.bank_cursor;
  changes := jsonb_array_length(page_input->'added') + jsonb_array_length(page_input->'modified') + jsonb_array_length(page_input->'removed');
  if changes > 500 or (changes > 0 and (page_input->>'cursor') is not distinct from (page_input->>'expectedCursor')) then
    raise exception 'Invalid bank sync page.' using errcode = '22023';
  end if;
  if (select count(distinct identity) from (
    select value->>'providerTransactionId' as identity from jsonb_array_elements((page_input->'added') || (page_input->'modified'))
    union all select value #>> '{}' from jsonb_array_elements(page_input->'removed')
  ) identities) <> changes then
    raise exception 'Duplicate bank transaction identity.' using errcode = '22023';
  end if;
  select * into connection from public.bank_connections where id = (page_input->>'connectionId')::uuid for update;
  if not found then raise exception 'Bank connection unavailable.' using errcode = '22023'; end if;
  fingerprint := encode(sha256(convert_to(page_input::text, 'UTF8')), 'hex');
  select * into receipt from public.bank_sync_pages where id = (page_input->>'pageId')::uuid;
  if found then
    if receipt.connection_id <> connection.id or receipt.input_fingerprint <> fingerprint then
      raise exception 'Bank page identity conflict.' using errcode = '22023';
    end if;
    return jsonb_build_object('outcome', 'duplicate', 'added', receipt.added, 'modified', receipt.modified, 'removed', receipt.removed);
  end if;
  if connection.status <> 'active' then raise exception 'Bank connection unavailable.' using errcode = '22023'; end if;
  if connection.sync_cursor is distinct from (page_input->>'expectedCursor') then
    raise exception 'Bank sync cursor conflict.' using errcode = '40001';
  end if;
  for snapshot in select value from jsonb_array_elements((page_input->'added') || (page_input->'modified')) loop
    if jsonb_typeof(snapshot) is distinct from 'object'
      or not (snapshot ?& array['providerTransactionId', 'accountId', 'amountMinor', 'currency', 'bookedOn', 'description', 'pending'])
      or (snapshot - array['providerTransactionId', 'accountId', 'amountMinor', 'currency', 'bookedOn', 'description', 'pending']) <> '{}'::jsonb
      or exists (select 1 from jsonb_each(snapshot) where key not in ('amountMinor', 'pending') and jsonb_typeof(value) <> 'string')
      or jsonb_typeof(snapshot->'amountMinor') is distinct from 'number'
      or (snapshot->>'amountMinor') !~ '^-?[0-9]+$'
      or jsonb_typeof(snapshot->'pending') is distinct from 'boolean'
      or (snapshot->>'bookedOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid bank transaction snapshot.' using errcode = '22023';
    end if;
    perform 1 from public.bank_accounts where id = (snapshot->>'accountId')::uuid and connection_id = connection.id and archived_at is null;
    if not found then raise exception 'Bank account unavailable.' using errcode = '22023'; end if;
    select * into existing from public.bank_transactions where connection_id = connection.id
      and provider_transaction_id = snapshot->>'providerTransactionId' for update;
    if found and (existing.account_id, existing.amount_minor, existing.currency, existing.booked_on, existing.pending, existing.removed_at)
      is distinct from ((snapshot->>'accountId')::uuid, (snapshot->>'amountMinor')::bigint,
        snapshot->>'currency', (snapshot->>'bookedOn')::date, (snapshot->>'pending')::boolean, null::timestamptz) then
      update public.reconciliation_links set revoked_at = now(), revocation_reason = 'bank_transaction_changed'
        where bank_transaction_id = existing.id and revoked_at is null;
      update public.bank_transactions set classification = 'unreviewed' where id = existing.id;
    end if;
    insert into public.bank_transactions(connection_id, account_id, provider_transaction_id, amount_minor, currency, booked_on, description, pending)
      values (connection.id, (snapshot->>'accountId')::uuid, snapshot->>'providerTransactionId',
        (snapshot->>'amountMinor')::bigint, snapshot->>'currency', (snapshot->>'bookedOn')::date, snapshot->>'description', (snapshot->>'pending')::boolean)
      on conflict (connection_id, provider_transaction_id) do update set
        account_id = excluded.account_id, amount_minor = excluded.amount_minor, currency = excluded.currency,
        booked_on = excluded.booked_on, description = excluded.description, pending = excluded.pending,
        removed_at = null, updated_at = now();
  end loop;
  if exists (select 1 from jsonb_array_elements(page_input->'removed') where jsonb_typeof(value) <> 'string') then
    raise exception 'Invalid removed bank identity.' using errcode = '22023';
  end if;
  for removed_id in select value from jsonb_array_elements_text(page_input->'removed') loop
    perform removed_id::public.bank_identifier;
    select * into existing from public.bank_transactions where connection_id = connection.id
      and provider_transaction_id = removed_id for update;
    if found then
      update public.reconciliation_links set revoked_at = now(), revocation_reason = 'bank_transaction_removed'
        where bank_transaction_id = existing.id and revoked_at is null;
      update public.bank_transactions set removed_at = coalesce(removed_at, now()), classification = 'unreviewed', updated_at = now() where id = existing.id;
    end if;
  end loop;
  insert into public.bank_sync_pages(id, connection_id, input_fingerprint, added, modified, removed)
    values ((page_input->>'pageId')::uuid, connection.id, fingerprint,
      jsonb_array_length(page_input->'added'), jsonb_array_length(page_input->'modified'), jsonb_array_length(page_input->'removed')) returning * into receipt;
  update public.bank_connections set sync_cursor = page_input->>'cursor', last_synced_at = now(), updated_at = now() where id = connection.id;
  return jsonb_build_object('outcome', 'applied', 'added', receipt.added, 'modified', receipt.modified, 'removed', receipt.removed);
end;
$$;

create function private.link_bank_reconciliation(link_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  source public.bank_transactions;
  target public.donations;
  target_ids uuid[];
  link_ids uuid[];
  existing_ids uuid[];
  actor uuid;
  link_kind text;
  provider text;
  total numeric := 0;
begin
  if jsonb_typeof(link_input) is distinct from 'object'
    or not (link_input ?& array['transactionId', 'actorId', 'kind', 'donationIds'])
    or (link_input - array['transactionId', 'actorId', 'kind', 'donationIds']) <> '{}'::jsonb
    or jsonb_typeof(link_input->'donationIds') is distinct from 'array'
    or jsonb_typeof(link_input->'actorId') is distinct from 'string'
    or jsonb_typeof(link_input->'transactionId') is distinct from 'string'
    or jsonb_typeof(link_input->'kind') is distinct from 'string' then
    raise exception 'Invalid reconciliation input.' using errcode = '22023';
  end if;
  if jsonb_array_length(link_input->'donationIds') not between 1 and 500
    or exists (select 1 from jsonb_array_elements(link_input->'donationIds') where jsonb_typeof(value) <> 'string') then
    raise exception 'Invalid reconciliation targets.' using errcode = '22023';
  end if;
  select array_agg(value::uuid order by value::uuid) into target_ids from jsonb_array_elements_text(link_input->'donationIds');
  link_kind := link_input->>'kind';
  if link_kind not in ('donation', 'processor_payout')
    or cardinality(target_ids) <> (select count(distinct id) from unnest(target_ids) ids(id))
    or (link_kind = 'donation' and cardinality(target_ids) <> 1) then
    raise exception 'Invalid reconciliation targets.' using errcode = '22023';
  end if;
  actor := (link_input->>'actorId')::uuid;
  perform 1 from public.profiles where id = actor and role = 'admin' and approved_at is not null for share;
  if not found then raise exception 'Administrator required.' using errcode = '42501'; end if;
  select * into source from public.bank_transactions where id = (link_input->>'transactionId')::uuid for update;
  if not found or source.amount_minor <= 0 or source.pending or source.removed_at is not null
    or source.classification not in ('unreviewed', link_kind) then
    raise exception 'Bank transaction cannot be reconciled.' using errcode = '22023';
  end if;
  -- Lock sorted targets before testing links; unique indexes also guard concurrent sources.
  perform 1 from public.donations where id = any(target_ids) order by id for update;
  if (select count(*) from public.donations where id = any(target_ids)) <> cardinality(target_ids) then
    raise exception 'Reconciliation target unavailable.' using errcode = '22023';
  end if;
  select array_agg(donation_id order by donation_id), array_agg(id order by donation_id)
    into existing_ids, link_ids from public.reconciliation_links where bank_transaction_id = source.id and revoked_at is null;
  if existing_ids is not null then
    if existing_ids = target_ids and source.classification = link_kind then
      return jsonb_build_object('outcome', 'duplicate', 'linkIds', to_jsonb(link_ids));
    end if;
    raise exception 'Bank transaction already reconciled.' using errcode = '22023';
  end if;
  for target in select * from public.donations where id = any(target_ids) order by id loop
    if target.currency <> source.currency or target.status not in ('succeeded', 'refunded', 'reversed')
      or (link_kind = 'processor_payout' and target.provider not in ('stripe', 'paypal'))
      or (link_kind = 'donation' and target.provider not in ('manual', 'bank'))
      or (provider is not null and provider <> target.provider) then
      raise exception 'Incompatible reconciliation target.' using errcode = '22023';
    end if;
    provider := target.provider;
    total := total + case when link_kind = 'processor_payout' then target.net_amount_minor else target.gross_amount_minor end;
  end loop;
  if total <> source.amount_minor then
    raise exception 'Reconciliation amounts do not match.' using errcode = '22023';
  end if;
  with inserted as (
    insert into public.reconciliation_links(bank_transaction_id, donation_id, kind, created_by, matched_amount_minor, currency)
      select source.id, id, link_kind, actor,
        case when link_kind = 'processor_payout' then net_amount_minor else gross_amount_minor end, currency
        from public.donations where id = any(target_ids) returning id, donation_id
  ) select array_agg(id order by donation_id) into link_ids from inserted;
  update public.bank_transactions set classification = link_kind, updated_at = now() where id = source.id;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
    values (actor, 'bank.reconciliation.linked', 'bank_transaction', source.id,
      jsonb_build_object('kind', link_kind, 'linkCount', cardinality(link_ids)));
  return jsonb_build_object('outcome', 'applied', 'linkIds', to_jsonb(link_ids));
end;
$$;

create function public.save_bank_sync_page(page_input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.save_bank_sync_page(page_input);
$$;
create function public.link_bank_reconciliation(link_input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.link_bank_reconciliation(link_input);
$$;
revoke all on function public.save_bank_sync_page(jsonb), private.save_bank_sync_page(jsonb),
  public.link_bank_reconciliation(jsonb), private.link_bank_reconciliation(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_bank_sync_page(jsonb), private.save_bank_sync_page(jsonb),
  public.link_bank_reconciliation(jsonb), private.link_bank_reconciliation(jsonb) to service_role;
